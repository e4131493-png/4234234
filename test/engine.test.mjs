import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { OptimizerEngine } from '../src/engine.mjs';
import { FORT_SECTION, validateOptions } from '../src/profiles.mjs';
import { getValue, planIni, restoreIni } from '../src/ini.mjs';

const original = `; Fortnite settings\r\n[${FORT_SECTION}]\r\nbUseVSync=True\r\nFrameRateLimit=144.000000\r\nCustomSetting=keep-me\r\n\r\n[ScalabilityGroups]\r\nsg.TextureQuality=3\r\n`;
const base = { preset: 'competitive', fpsCap: 280, scale: 100, fortnite: true, capture: true, gameMode: true, power: false };
class FakeWindows {
  constructor(file) { this.supported = true; this.configPath = file; this.registry = new Map(); this.power = '381b4222-f694-41f0-9685-ff5bb260df2e'; this.running = false; this.hasPower = true; }
  assertWindows() { if (!this.supported) throw new Error('Windows required'); }
  async assertGameClosed() { if (this.running) throw new Error('Close Fortnite'); }
  async readRegistry(target) { return this.registry.get(target.name) || { exists: false }; }
  async writeRegistry(target, value) { if (!value.exists) this.registry.delete(target.name); else this.registry.set(target.name, value); if (this.failWrite) throw new Error('Simulated interruption after mutation'); }
  async getPower() { return this.power; }
  async setPower(value) { this.power = value; }
  async hasHighPerformance() { return this.hasPower; }
}
async function fixture(t, text = original) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dropzone-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'GameUserSettings.ini');
  await fs.writeFile(file, text);
  const adapter = new FakeWindows(file);
  const engine = new OptimizerEngine(adapter, path.join(root, 'recovery'));
  return { root, file, adapter, engine };
}
test('apply and restore real config files, preserving unrelated user edits', async t => {
  const { file, adapter, engine } = await fixture(t);
  await engine.apply({ ...base, power: true });
  let text = await fs.readFile(file, 'utf8');
  assert.equal(getValue(text, FORT_SECTION, 'FrameRateLimit'), '280.000000');
  assert.equal(getValue(text, FORT_SECTION, 'bUseVSync'), 'False');
  assert.equal(getValue(text, 'ScalabilityGroups', 'sg.TextureQuality'), '0');
  assert.equal(getValue(text, FORT_SECTION, 'CustomSetting'), 'keep-me');
  assert.ok(text.includes('\r\n'));
  assert.equal(adapter.registry.size, 3);
  assert.equal(adapter.power, '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
  const active = await engine.active();
  assert.equal(await fs.readFile(path.join(engine.dataDir, 'backups', active.id, 'GameUserSettings.original.ini'), 'utf8'), original);
  text = text.replace('CustomSetting=keep-me', 'CustomSetting=my-new-setting');
  await fs.writeFile(file, text);
  await engine.restore();
  text = await fs.readFile(file, 'utf8');
  assert.equal(getValue(text, FORT_SECTION, 'FrameRateLimit'), '144.000000');
  assert.equal(getValue(text, FORT_SECTION, 'bUseVSync'), 'True');
  assert.equal(getValue(text, FORT_SECTION, 'CustomSetting'), 'my-new-setting');
  assert.equal(getValue(text, FORT_SECTION, 'bMotionBlur'), null);
  assert.equal(getValue(text, 'ScalabilityGroups', 'sg.TextureQuality'), '3');
  assert.equal(adapter.registry.size, 0);
  assert.equal(adapter.power, '381b4222-f694-41f0-9685-ff5bb260df2e');
  assert.equal(await engine.active(), null);
  await fs.access(path.join(engine.dataDir, 'backups', active.id, 'restored-settings.json'));
});
test('existing registry values and kinds are restored exactly', async t => {
  const { adapter, engine } = await fixture(t);
  const before = { exists: true, value: 'old-value', kind: 'String' };
  adapter.registry.set('AutoGameModeEnabled', before);
  await engine.apply({ ...base, fortnite: false, capture: false });
  assert.equal(adapter.registry.get('AutoGameModeEnabled').value, 1);
  await engine.restore();
  assert.deepEqual(adapter.registry.get('AutoGameModeEnabled'), before);
});
test('refuses changes while Fortnite is running without creating a backup', async t => {
  const { engine, adapter, file } = await fixture(t);
  adapter.running = true;
  await assert.rejects(engine.apply(base), /Close Fortnite/);
  assert.equal(await engine.active(), null);
  assert.equal(await fs.readFile(file, 'utf8'), original);
});
test('does not fabricate a missing Fortnite config; Windows-only setup still works', async t => {
  const { engine, file } = await fixture(t);
  await fs.rm(file);
  await assert.rejects(engine.apply(base), /Launch Fortnite once/);
  assert.equal(await engine.active(), null);
  await engine.apply({ ...base, fortnite: false });
  assert.equal((await engine.status()).backup.state, 'applied');
  await engine.restore();
});
test('requires restoration before applying a second preset', async t => {
  const { engine } = await fixture(t);
  await engine.apply(base);
  const id = (await engine.active()).id;
  await assert.rejects(engine.apply({ ...base, preset: 'potato' }), /Restore your active backup/);
  assert.equal((await engine.active()).id, id);
});
test('recovers a write interrupted after mutation, across an engine restart', async t => {
  const { engine, adapter, file } = await fixture(t);
  adapter.failWrite = true;
  await assert.rejects(engine.apply(base), /Some changes may have been applied/);
  assert.equal((await engine.active()).state, 'incomplete');
  assert.equal(adapter.registry.size, 1);
  adapter.failWrite = false;
  const restarted = new OptimizerEngine(adapter, engine.dataDir);
  await restarted.restore();
  assert.equal(adapter.registry.size, 0);
  assert.equal(getValue(await fs.readFile(file, 'utf8'), FORT_SECTION, 'bUseVSync'), 'True');
  assert.equal(await restarted.active(), null);
});
test('restoration protects newer managed settings and can resume after conflict resolution', async t => {
  const { engine, adapter, file } = await fixture(t);
  await engine.apply(base);
  const applied = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, applied.replace('FrameRateLimit=280.000000', 'FrameRateLimit=200.000000'));
  await assert.rejects(engine.restore(), /FrameRateLimit/);
  assert.equal(adapter.registry.size, 0); // Independent Windows restoration proceeds.
  assert.equal((await engine.active()).state, 'restore-incomplete');
  assert.equal(getValue(await fs.readFile(file, 'utf8'), FORT_SECTION, 'FrameRateLimit'), '200.000000');
  await fs.writeFile(file, applied);
  await engine.restore();
  assert.equal(await engine.active(), null);
});
test('restoration protects registry changes made by another program', async t => {
  const { engine, adapter } = await fixture(t);
  await engine.apply(base);
  adapter.registry.set('GameDVR_Enabled', { exists: true, value: 2, kind: 'DWord' });
  await assert.rejects(engine.restore(), /GameDVR_Enabled was changed/);
  assert.equal(adapter.registry.get('GameDVR_Enabled').value, 2);
  assert.equal((await engine.active()).state, 'restore-incomplete');
});
test('unsupported power plan is diagnosed before making any changes', async t => {
  const { engine, adapter, file } = await fixture(t);
  adapter.hasPower = false;
  await assert.rejects(engine.apply({ ...base, power: true }), /does not offer/);
  assert.equal(await fs.readFile(file, 'utf8'), original);
  assert.equal(await engine.active(), null);
  assert.equal(adapter.registry.size, 0);
});
test('simultaneous operations are rejected', async t => {
  const { engine, adapter } = await fixture(t);
  let release;
  adapter.assertGameClosed = () => new Promise(resolve => { release = resolve; });
  const applying = engine.apply(base);
  await assert.rejects(engine.apply(base), /Another operation/);
  release();
  await applying;
});
test('UTF-16LE files retain encoding and BOM', async t => {
  const { engine, file } = await fixture(t, Buffer.concat([Buffer.from([255,254]), Buffer.from(original, 'utf16le')]));
  await engine.apply(base);
  const bytes = await fs.readFile(file);
  assert.deepEqual([...bytes.subarray(0, 2)], [255,254]);
  assert.equal(getValue(bytes.subarray(2).toString('utf16le'), FORT_SECTION, 'FrameRateLimit'), '280.000000');
  await engine.restore();
  assert.equal(getValue((await fs.readFile(file)).subarray(2).toString('utf16le'), FORT_SECTION, 'FrameRateLimit'), '144.000000');
});
test('non-Windows platforms cannot apply changes', async t => {
  const { engine, adapter } = await fixture(t);
  adapter.supported = false;
  await assert.rejects(engine.apply(base), /Windows required/);
  assert.equal(await engine.active(), null);
});
test('already matching settings do not create misleading backups', async t => {
  const { engine, adapter } = await fixture(t);
  adapter.registry.set('AutoGameModeEnabled', { exists: true, value: 1, kind: 'DWord' });
  assert.match((await engine.apply({ ...base, fortnite: false, capture: false })).message, /already match/);
  assert.equal(await engine.active(), null);
});
test('rejects unknown and out-of-range input before preparing changes', () => {
  for (const options of [{ ...base, preset: '__proto__' }, { ...base, scale: 10 }, { ...base, fpsCap: -1 }, { ...base, path: 'C:\\anything' }, { ...base, power: 'yes' }, { ...base, fortnite: false, capture: false, gameMode: false, power: false }]) assert.throws(() => validateOptions(options));
  assert.equal(validateOptions({ ...base, fpsCap: 277 }).fpsCap, 277);
  assert.equal(validateOptions({ ...base, fpsCap: 0 }).fpsCap, 0);
});
test('INI edits reject duplicate keys, retain comments and handle missing sections', () => {
  assert.throws(() => planIni('[Section]\nx=1\nx=2\n', { Section: { x: '3' } }), /Duplicate/);
  const { result, changes } = planIni('; user comment\n[Other]\ny=2\n', { New: { x: '3' } });
  assert.equal(getValue(result, 'New', 'x'), '3');
  assert.ok(result.startsWith('; user comment\n'));
  assert.equal(getValue(restoreIni(result, changes), 'Other', 'y'), '2');
  assert.equal(getValue(restoreIni(result, changes), 'New', 'x'), null);
});
test('a corrupt recovery record fails closed', async t => {
  const { engine, file } = await fixture(t);
  await fs.mkdir(engine.dataDir, { recursive: true });
  await fs.writeFile(engine.manifestPath, 'not-json');
  await assert.rejects(engine.apply(base), /recovery record cannot be read/);
  assert.equal(await fs.readFile(file, 'utf8'), original);
});
