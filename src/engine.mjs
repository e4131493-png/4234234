import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { desiredIni, REGISTRY_OPTIONS, validateOptions } from './profiles.mjs';
import { planIni, restoreIni } from './ini.mjs';

const HIGH_PERFORMANCE = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function readIni(file) {
  const bytes = await fs.readFile(file);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: bytes.subarray(2).toString('utf16le'), encoding: 'utf16le', bom: true };
  if (bytes.includes(0)) throw new Error('Unsupported Fortnite settings encoding; no changes were made.');
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  return { text: bytes.subarray(bom ? 3 : 0).toString('utf8'), encoding: 'utf8', bom };
}
async function writeIni(file, doc) {
  const prefix = doc.bom ? (doc.encoding === 'utf16le' ? Buffer.from([255, 254]) : Buffer.from([239, 187, 191])) : Buffer.alloc(0);
  // Rename within the same directory avoids leaving a partially written config after interruption.
  const temp = `${file}.dropzone-${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, Buffer.concat([prefix, Buffer.from(doc.text, doc.encoding)]), { flag: 'wx' });
    await fs.rename(temp, file);
  } finally { await fs.rm(temp, { force: true }); }
}

export class OptimizerEngine {
  constructor(adapter, dataDir) {
    this.adapter = adapter;
    this.dataDir = dataDir;
    this.manifestPath = path.join(dataDir, 'active-backup.json');
    this.busy = false;
  }
  async active() {
    try { return JSON.parse(await fs.readFile(this.manifestPath, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw new Error('The recovery record cannot be read. Open the backup folder before making more changes.'); }
  }
  async save(manifest) {
    await fs.mkdir(this.dataDir, { recursive: true });
    const temp = this.manifestPath + '.tmp';
    await fs.writeFile(temp, JSON.stringify(manifest, null, 2));
    await fs.rename(temp, this.manifestPath);
  }
  async exclusive(task) {
    if (this.busy) throw new Error('Another operation is running. Please wait.');
    this.busy = true;
    try { return await task(); } finally { this.busy = false; }
  }
  async status() {
    const active = await this.active();
    return {
      supported: this.adapter.supported,
      configFound: this.adapter.configPath ? await exists(this.adapter.configPath) : false,
      backup: active ? { createdAt: active.createdAt, state: active.state, preset: active.options.preset, applied: active.operations.filter(o => o.state === 'applied').length, total: active.operations.length } : null
    };
  }
  async apply(input) {
    return this.exclusive(async () => {
      this.adapter.assertWindows();
      const options = validateOptions(input);
      await this.adapter.assertGameClosed();
      if (await this.active()) throw new Error('Restore your active backup before applying another preset.');
      const operations = [];
      let originalDoc;
      if (options.fortnite) {
        if (!this.adapter.configPath || !await exists(this.adapter.configPath)) throw new Error('Fortnite settings were not found. Launch Fortnite once, close it, then scan again.');
        originalDoc = await readIni(this.adapter.configPath);
        const edit = planIni(originalDoc.text, desiredIni(options));
        if (edit.changes.length) operations.push({ type: 'ini', path: this.adapter.configPath, changes: edit.changes, state: 'pending' });
      }
      for (const key of ['capture', 'gameMode']) {
        if (!options[key]) continue;
        for (const target of REGISTRY_OPTIONS[key]) {
          const before = await this.adapter.readRegistry(target);
          if (before.exists && !['DWord', 'QWord', 'String', 'ExpandString'].includes(before.kind)) throw new Error(`Unsupported existing ${target.name} registry type. No changes were made.`);
          const after = { exists: true, value: target.value, kind: 'DWord' };
          if (!same(before, after)) operations.push({ type: 'registry', target, before, after, state: 'pending' });
        }
      }
      if (options.power) {
        if (!await this.adapter.hasHighPerformance()) throw new Error('Windows does not offer the High performance plan on this PC. Turn off that option and try again.');
        const before = await this.adapter.getPower();
        if (before !== HIGH_PERFORMANCE) operations.push({ type: 'power', before, after: HIGH_PERFORMANCE, state: 'pending' });
      }
      if (!operations.length) return { message: 'Your selected settings already match. No changes were needed.' };
      const manifest = { version: 1, id: randomUUID(), createdAt: new Date().toISOString(), state: 'applying', options, operations };
      const backupDir = path.join(this.dataDir, 'backups', manifest.id);
      await fs.mkdir(backupDir, { recursive: true });
      if (originalDoc) await fs.copyFile(this.adapter.configPath, path.join(backupDir, 'GameUserSettings.original.ini'));
      await fs.writeFile(path.join(backupDir, 'original-settings.json'), JSON.stringify(manifest, null, 2));
      await this.save(manifest);
      try {
        for (const op of operations) {
          op.state = 'applying';
          await this.save(manifest); // Journal before mutation, including interrupted writes.
          await this.applyOperation(op, originalDoc);
          op.state = 'applied';
          await this.save(manifest);
        }
        manifest.state = 'applied';
        await this.save(manifest);
      } catch (error) {
        manifest.state = 'incomplete';
        await this.save(manifest);
        throw new Error(`Some changes may have been applied. Use Restore backup to recover. ${error.message}`);
      }
      return { message: 'Settings applied and originals backed up. Launch Fortnite and check your video settings.' };
    });
  }
  async applyOperation(op, originalDoc) {
    if (op.type === 'ini') {
      const current = await readIni(op.path);
      if (current.text !== originalDoc.text) throw new Error('Fortnite settings changed while preparing the backup.');
      const desired = {};
      for (const c of op.changes) (desired[c.section] ??= {})[c.key] = c.after;
      const text = planIni(current.text, desired).result;
      await writeIni(op.path, { ...current, text });
      if ((await readIni(op.path)).text !== text) throw new Error('Fortnite did not retain the settings.');
    } else if (op.type === 'registry') {
      if (!same(await this.adapter.readRegistry(op.target), op.before)) throw new Error(`${op.target.name} changed while preparing the backup.`);
      await this.adapter.writeRegistry(op.target, op.after);
      if (!same(await this.adapter.readRegistry(op.target), op.after)) throw new Error(`Windows did not retain ${op.target.name}.`);
    } else {
      if (await this.adapter.getPower() !== op.before) throw new Error('The power plan changed while preparing the backup.');
      await this.adapter.setPower(op.after);
      if (await this.adapter.getPower() !== op.after) throw new Error('Windows did not retain the power plan.');
    }
  }
  async restore() {
    return this.exclusive(async () => {
      this.adapter.assertWindows();
      await this.adapter.assertGameClosed();
      const manifest = await this.active();
      if (!manifest) throw new Error('There is no active backup to restore.');
      const errors = [];
      for (const op of [...manifest.operations].reverse()) {
        if (['pending', 'restored'].includes(op.state)) continue;
        try {
          if (op.type === 'ini') {
            const current = await readIni(op.path);
            const text = restoreIni(current.text, op.changes);
            if (text !== current.text) {
              await writeIni(op.path, { ...current, text });
              if ((await readIni(op.path)).text !== text) throw new Error('Fortnite did not retain the restored settings.');
            }
          } else if (op.type === 'registry') {
            const current = await this.adapter.readRegistry(op.target);
            if (!same(current, op.before)) {
              if (!same(current, op.after)) throw new Error(`${op.target.name} was changed outside Dropzone. Original value retained in the backup.`);
              await this.adapter.writeRegistry(op.target, op.before);
              if (!same(await this.adapter.readRegistry(op.target), op.before)) throw new Error(`Windows did not restore ${op.target.name}.`);
            }
          } else if (op.type === 'power') {
            const current = await this.adapter.getPower();
            if (current !== op.before) {
              if (current !== op.after) throw new Error('The power plan was changed outside Dropzone. Original plan retained in the backup.');
              await this.adapter.setPower(op.before);
              if (await this.adapter.getPower() !== op.before) throw new Error('Windows did not restore the power plan.');
            }
          }
          op.state = 'restored';
          await this.save(manifest);
        } catch (error) { errors.push(error.message); }
      }
      if (errors.length) {
        manifest.state = 'restore-incomplete';
        await this.save(manifest);
        throw new Error(errors.join('\n'));
      }
      manifest.state = 'restored';
      await fs.writeFile(path.join(this.dataDir, 'backups', manifest.id, 'restored-settings.json'), JSON.stringify(manifest, null, 2));
      await fs.rm(this.manifestPath);
      return { message: 'Your original settings are restored. Backup files are kept for reference.' };
    });
  }
}
