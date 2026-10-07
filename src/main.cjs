const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
app.setName('Dropzone Optimizer');
if (process.platform === 'win32') app.setAppUserModelId('app.dropzone.optimizer');
let window;
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(async () => {
    const { WindowsAdapter } = await import('./windows.mjs');
    const { OptimizerEngine } = await import('./engine.mjs');
    const adapter = new WindowsAdapter();
    const dataDir = path.join(app.getPath('userData'), 'recovery');
    const engine = new OptimizerEngine(adapter, dataDir);
    const uiPath = path.join(__dirname, '..', 'ui', 'index.html');
    const uiURL = pathToFileURL(uiPath).href;
    function handle(name, action) {
      ipcMain.handle(name, async (event, ...args) => {
        if (event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== uiURL) return { ok: false, error: 'Untrusted request.' };
        try { return { ok: true, data: await action(...args) }; }
        catch (error) { return { ok: false, error: error.message }; }
      });
    }
    handle('status', () => engine.status());
    handle('scan', async () => ({ ...(await engine.status()), hardware: adapter.supported ? await adapter.scanHardware() : null }));
    handle('apply', options => engine.apply(options));
    handle('restore', () => engine.restore());
    handle('open-backups', async () => { await fs.mkdir(dataDir, { recursive: true }); const error = await shell.openPath(dataDir); if (error) throw new Error(error); });
    handle('open-display', async () => { adapter.assertWindows(); await shell.openExternal('ms-settings:display-advanced'); });
    handle('minimize', () => window.minimize());
    handle('close', () => { if (engine.busy) throw new Error('Please wait for the current operation to finish.'); window.close(); });
    window = new BrowserWindow({ width: 1250, height: 850, minWidth: 960, minHeight: 700, backgroundColor: '#101116', frame: false, autoHideMenuBar: true, title: 'Dropzone Optimizer', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.on('close', event => { if (engine.busy) event.preventDefault(); });
    await window.loadFile(uiPath);
  });
  app.on('window-all-closed', () => app.quit());
}
