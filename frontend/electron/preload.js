const { contextBridge, ipcRenderer } = require('electron')

// This runs in the preload context, independently of React. If the renderer's
// main thread is trapped in an update loop it stops reaching this timer, which
// lets the Electron main process offer recovery even when the page is white.
setInterval(() => ipcRenderer.send('renderer-heartbeat'), 2000)

contextBridge.exposeInMainWorld('electronAPI', {
  getPlatformInfo: () => ipcRenderer.invoke('get-platform-info'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onWindowRestored: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('window-restored', listener)
    return () => ipcRenderer.removeListener('window-restored', listener)
  },
})
