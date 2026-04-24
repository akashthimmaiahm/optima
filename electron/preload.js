'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe, limited API to the renderer process (React app)
// Never expose ipcRenderer directly — only wrap specific channels
contextBridge.exposeInMainWorld('electronAPI', {
  getVersion:  () => ipcRenderer.invoke('app:version'),
  getPlatform: () => ipcRenderer.invoke('app:platform'),
});
