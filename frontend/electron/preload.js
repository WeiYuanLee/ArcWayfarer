const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getPlatformInfo: () => ipcRenderer.invoke('get-platform-info'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onWindowRestored: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('window-restored', listener)
    return () => ipcRenderer.removeListener('window-restored', listener)
  },
})
