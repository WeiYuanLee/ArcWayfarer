const { app, BrowserWindow } = require('electron')
const { spawn } = require('child_process')
const path = require('path')

const isDev = !app.isPackaged
let backendProc = null
let mainWindow = null

function backendExecutablePath() {
  return path.join(process.resourcesPath, 'backend', 'arcwayfarer-backend')
}

function startBackend() {
  if (isDev) return
  const exe = backendExecutablePath()
  console.log('[electron] spawning backend:', exe)
  backendProc = spawn(exe, [])
  backendProc.stdout.on('data', (d) => process.stdout.write(`[backend] ${d}`))
  backendProc.stderr.on('data', (d) => process.stderr.write(`[backend] ${d}`))
  backendProc.on('exit', (code) => {
    console.log('[electron] backend exited with code', code)
    backendProc = null
  })
}

function stopBackend() {
  if (!backendProc) return
  try {
    backendProc.kill()
  } catch {
    // already exited
  }
  backendProc = null
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  startBackend()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopBackend()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', stopBackend)
