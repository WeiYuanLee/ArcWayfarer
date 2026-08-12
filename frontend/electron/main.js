const { app, BrowserWindow, dialog, shell, ipcMain } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const net = require('net')

ipcMain.handle('get-platform-info', () => {
  return {
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion(),
  }
})

ipcMain.handle('open-external', async (_, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    await shell.openExternal(url)
  }
})


const isDev = !app.isPackaged
let backendProc = null
let tunneldProc = null
let mainWindow = null

const TUNNELD_HOST = '127.0.0.1'
const TUNNELD_PORT = 49151

function backendExecutablePath() {
  const exeName = process.platform === 'win32' ? 'arcwayfarer-backend.exe' : 'arcwayfarer-backend'
  return path.join(process.resourcesPath, 'backend', exeName)
}

function isPortOpen(host, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    const finish = (open) => {
      socket.destroy()
      resolve(open)
    }
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.setTimeout(timeoutMs, () => finish(false))
  })
}

function waitForPort(host, port, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const check = async () => {
      if (await isPortOpen(host, port)) return resolve()
      if (Date.now() - startedAt >= timeoutMs) {
        return reject(new Error('The iOS tunnel service did not start within ' + timeoutMs + 'ms'))
      }
      setTimeout(check, 250)
    }
    check()
  })
}

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\\"'\\\"'")}'`
}

async function startTunneld() {
  if (isDev || await isPortOpen(TUNNELD_HOST, TUNNELD_PORT)) return

  const exe = backendExecutablePath()
  console.log('[electron] spawning pymobiledevice3 tunneld:', exe)

  if (process.platform === 'darwin') {
    // Kernel tunnels require root on macOS. osascript provides the native
    // authorization prompt while keeping the bundled backend self-contained.
    const command = `${shellQuote(exe)} --tunneld >/tmp/arcwayfarer-tunneld.log 2>&1 & echo $!`
    const privileged = spawn('osascript', [
      '-e',
      `do shell script ${JSON.stringify(command)} with administrator privileges`,
    ])
    let output = ''
    let errors = ''
    privileged.stdout.on('data', (data) => { output += data })
    privileged.stderr.on('data', (data) => { errors += data })
    await new Promise((resolve, reject) => {
      privileged.once('error', reject)
      privileged.once('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(errors.trim() || `macOS authorization exited with code ${code}`))
      })
    })
    console.log('[electron] macOS tunneld pid:', output.trim())
  } else {
    // Windows packaging requests UAC elevation, so this child inherits the
    // administrator token required by pymobiledevice3's kernel tunnel.
    tunneldProc = spawn(exe, ['--tunneld'], { cwd: path.dirname(exe) })
    tunneldProc.stdout.on('data', (data) => process.stdout.write(`[tunneld] ${data}`))
    tunneldProc.stderr.on('data', (data) => process.stderr.write(`[tunneld] ${data}`))
    tunneldProc.on('exit', (code) => {
      console.log('[electron] tunneld exited with code', code)
      tunneldProc = null
    })
  }

  await waitForPort(TUNNELD_HOST, TUNNELD_PORT)
}

function waitForBackend(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const interval = 500

    function check() {
      const req = http.get(url, (res) => {
        if (res.statusCode === 200) {
          resolve()
        } else {
          retry()
        }
      })
      req.on('error', retry)
      req.setTimeout(1000, () => { req.destroy(); retry() })
    }

    function retry() {
      if (Date.now() - start >= timeoutMs) {
        reject(new Error('Backend did not start within ' + timeoutMs + 'ms'))
      } else {
        setTimeout(check, interval)
      }
    }

    check()
  })
}

function startBackend() {
  if (isDev) return Promise.resolve()
  const exe = backendExecutablePath()
  console.log('[electron] spawning backend:', exe)
  backendProc = spawn(exe, [], {
    cwd: path.dirname(exe),
    env: { ...process.env, ARCWAYFARER_WEB_DIR: path.join(process.resourcesPath, 'mobile-web') },
  })
  backendProc.stdout.on('data', (d) => process.stdout.write(`[backend] ${d}`))
  backendProc.stderr.on('data', (d) => process.stderr.write(`[backend] ${d}`))
  backendProc.on('exit', (code) => {
    console.log('[electron] backend exited with code', code)
    backendProc = null
  })

  return waitForBackend('http://127.0.0.1:8787/health')
}

function stopTunneld() {
  if (!tunneldProc) return
  try {
    tunneldProc.kill()
  } catch {
    // already exited
  }
  tunneldProc = null
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(async () => {
  try {
    // The tunnel may need extra time to initialise its USB monitors. It must
    // not prevent the application and its normal backend from opening.
    startTunneld().catch((err) => {
      console.error('[electron] iOS tunnel service failed to start:', err.message)
    })
    await startBackend()
  } catch (err) {
    console.error('[electron] Failed to start backend:', err.message)
    dialog.showErrorBox(
      'Startup Error',
      'The backend server failed to start.\n\n' + err.message
    )
  }
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopBackend()
  stopTunneld()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopBackend()
  stopTunneld()
})
