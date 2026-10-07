import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { WindowsAdapter } from '../src/windows.mjs';

test('Windows PowerShell, hardware detection and reversible test-key writes', { skip: process.platform !== 'win32' }, async t => {
  const adapter = new WindowsAdapter();
  const key = `HKCU:\\Software\\DropzoneIntegrationTest-${randomUUID()}`;
  const target = { path: key, name: 'RoundTrip' };
  t.after(() => adapter.ps(`Remove-Item -LiteralPath '${key}' -Recurse -Force -ErrorAction SilentlyContinue`));
  assert.deepEqual(await adapter.readRegistry(target), { exists: false });
  const dword = { exists: true, value: 1, kind: 'DWord' };
  await adapter.writeRegistry(target, dword);
  assert.deepEqual(await adapter.readRegistry(target), dword);
  const string = { exists: true, value: "Value with 'quotes' and spaces", kind: 'String' };
  await adapter.writeRegistry(target, string);
  assert.deepEqual(await adapter.readRegistry(target), string);
  await adapter.writeRegistry(target, { exists: false });
  assert.deepEqual(await adapter.readRegistry(target), { exists: false });
  const hardware = await adapter.scanHardware();
  assert.ok(hardware.cpu.length > 0);
  assert.ok(hardware.ramGB > 0);
  assert.ok(hardware.totalGB > 0);
  assert.match(await adapter.getPower(), /^[0-9a-f-]{36}$/);
  assert.equal(typeof await adapter.hasHighPerformance(), 'boolean');
  await adapter.assertGameClosed();
});
