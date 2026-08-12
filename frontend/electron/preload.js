const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getPlatformInfo: () => ipcRenderer.invoke('get-platform-info'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
})

