const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('optimizer', Object.freeze({
  status: () => ipcRenderer.invoke('status'),
  scan: () => ipcRenderer.invoke('scan'),
  apply: options => ipcRenderer.invoke('apply', options),
  restore: () => ipcRenderer.invoke('restore'),
  openBackups: () => ipcRenderer.invoke('open-backups'),
  openDisplay: () => ipcRenderer.invoke('open-display'),
  minimize: () => ipcRenderer.invoke('minimize'),
  close: () => ipcRenderer.invoke('close')
}));
