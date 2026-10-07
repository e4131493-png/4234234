import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
const exec = promisify(execFile);
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
export class WindowsAdapter {
  constructor() {
    this.supported = process.platform === 'win32';
    this.configPath = this.supported && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'FortniteGame', 'Saved', 'Config', 'WindowsClient', 'GameUserSettings.ini') : null;
    this.powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    this.powercfg = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'powercfg.exe');
  }
  assertWindows() { if (!this.supported) throw new Error('Applying optimizations requires Windows 10 or 11. This is a preview only.'); }
  async ps(script) {
    this.assertWindows();
    const encoded = Buffer.from("$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; " + script, 'utf16le').toString('base64');
    const { stdout } = await exec(this.powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
    return stdout.trim();
  }
  async assertGameClosed() {
    const running = await this.ps("@(Get-Process -Name 'FortniteClient*','FortniteLauncher*' -ErrorAction SilentlyContinue).Count");
    if (Number(running) > 0) throw new Error('Close Fortnite before applying or restoring settings.');
  }
  async scanHardware() {
    return JSON.parse(await this.ps("$cpu=Get-CimInstance Win32_Processor | Select-Object -First 1; $ram=Get-CimInstance Win32_ComputerSystem; $gpu=@(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name); $disk=Get-PSDrive -Name ($env:SystemDrive.TrimEnd(':')); [pscustomobject]@{cpu=$cpu.Name.Trim();gpu=($gpu -join ' / ');ramGB=[math]::Round($ram.TotalPhysicalMemory/1GB);freeGB=[math]::Round($disk.Free/1GB);totalGB=[math]::Round(($disk.Free+$disk.Used)/1GB);processes=@(Get-Process).Count;os=(Get-CimInstance Win32_OperatingSystem).Caption} | ConvertTo-Json -Compress"));
  }
  async readRegistry(target) {
    const p = quote(target.path), n = quote(target.name);
    return JSON.parse(await this.ps(`$key=Get-Item -LiteralPath ${p} -ErrorAction SilentlyContinue; if ($null -ne $key -and $key.GetValueNames() -contains ${n}) { [pscustomobject]@{exists=$true;value=$key.GetValue(${n});kind=$key.GetValueKind(${n}).ToString()} | ConvertTo-Json -Compress } else { '{"exists":false}' }`));
  }
  async writeRegistry(target, snapshot) {
    const p = quote(target.path), n = quote(target.name);
    if (!snapshot.exists) { await this.ps(`if (Test-Path -LiteralPath ${p}) { Remove-ItemProperty -LiteralPath ${p} -Name ${n} -ErrorAction SilentlyContinue }`); return; }
    if (!['DWord', 'QWord', 'String', 'ExpandString'].includes(snapshot.kind)) throw new Error('Unsupported existing registry value type.');
    let value;
    if (['DWord', 'QWord'].includes(snapshot.kind)) {
      if (!Number.isSafeInteger(snapshot.value)) throw new Error('Invalid numeric registry value.');
      value = String(snapshot.value);
    } else value = quote(snapshot.value);
    await this.ps(`if (-not (Test-Path -LiteralPath ${p})) { New-Item -Path ${p} -Force | Out-Null }; New-ItemProperty -LiteralPath ${p} -Name ${n} -Value ${value} -PropertyType ${snapshot.kind} -Force | Out-Null`);
  }
  async getPower() {
    this.assertWindows();
    const { stdout } = await exec(this.powercfg, ['/getactivescheme'], { windowsHide: true, timeout: 10000 });
    const guid = stdout.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i)?.[0];
    if (!guid) throw new Error('Could not read the active Windows power plan.');
    return guid.toLowerCase();
  }
  async setPower(guid) {
    this.assertWindows();
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(guid)) throw new Error('Invalid power plan.');
    await exec(this.powercfg, ['/setactive', guid], { windowsHide: true, timeout: 10000 });
  }
  async hasHighPerformance() {
    this.assertWindows();
    const { stdout } = await exec(this.powercfg, ['/list'], { windowsHide: true, timeout: 10000 });
    return stdout.toLowerCase().includes('8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
  }
}
