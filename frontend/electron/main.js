const { app, BrowserWindow, dialog, shell, ipcMain, session } = require('electron')
const { spawn, execSync } = require('child_process')
const path = require('path')
const http = require('http')
const net = require('net')
const { pathToFileURL } = require('url')

const isDev = !app.isPackaged
const isStartupSmokeTest = process.env.ARCWAYFARER_STARTUP_SMOKE_TEST === '1'
const DEV_SERVER_ORIGIN = 'http://localhost:5173'
const ALLOWED_RENDERER_PERMISSIONS = new Set(['clipboard-read', 'clipboard-sanitized-write'])

let backendProc = null
let tunneldProc = null
let mainWindow = null
let lastRendererHeartbeatAt = 0
let rendererRecoveryTimer = null
let rendererRecoveryPromptOpen = false

function productionEntryUrl() {
  return pathToFileURL(path.join(__dirname, '../dist/index.html')).href
}

function isTrustedAppUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    if (isDev) return url.origin === DEV_SERVER_ORIGIN
    const entryUrl = new URL(productionEntryUrl())
    return url.protocol === entryUrl.protocol && url.host === entryUrl.host && url.pathname === entryUrl.pathname
  } catch {
    return false
  }
}

function isTrustedIpcSender(event) {
  const webContents = mainWindow?.webContents
  return Boolean(
    webContents &&
    !webContents.isDestroyed() &&
    event.sender === webContents &&
    event.senderFrame === webContents.mainFrame &&
    isTrustedAppUrl(event.senderFrame.url)
  )
}

function isTrustedPermissionSource(webContents, details) {
  return Boolean(
    webContents &&
    details?.isMainFrame &&
    isTrustedAppUrl(details.requestingUrl || webContents.getURL())
  )
}

function parseExternalUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

async function openExternalUrl(rawUrl) {
  const url = parseExternalUrl(rawUrl)
  if (!url) return
  await shell.openExternal(url)
}

function getHardwareArch() {
  if (process.platform === 'darwin') {
    try {
      const result = execSync('sysctl -n hw.optional.arm64', { timeout: 1000 }).toString().trim()
      return result === '1' ? 'arm64' : 'x64'
    } catch {
      // hw.optional.arm64 doesn't exist on Intel Macs → not Apple Silicon
      return 'x64'
    }
  }
  return process.arch
}

ipcMain.handle('get-platform-info', (event) => {
  if (!isTrustedIpcSender(event)) throw new Error('Rejected IPC request from an untrusted renderer')
  return {
    platform: process.platform,
    arch: getHardwareArch(),
    version: app.getVersion(),
  }
})

ipcMain.handle('open-external', async (event, url) => {
  if (!isTrustedIpcSender(event)) throw new Error('Rejected IPC request from an untrusted renderer')
  await openExternalUrl(url)
})

const TUNNELD_HOST = '127.0.0.1'
const TUNNELD_PORT = 49151

function backendExecutablePath() {
  const exeName = process.platform === 'win32' ? 'arcwayfarer-backend.exe' : 'arcwayfarer-backend'
  return path.join(process.resourcesPath, 'backend', exeName)
}

function authorizationHelperPath() {
  return path.join(process.resourcesPath, 'ArcWayfarer.app', 'Contents', 'MacOS', 'applet')
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
    // Kernel tunnels require root on macOS. The bundled AppleScript applet
    // preserves the native prompt but gives it the ArcWayfarer app name.
    const command = `${shellQuote(exe)} --tunneld >/tmp/arcwayfarer-tunneld.log 2>&1 & echo $!`
    const privileged = spawn(authorizationHelperPath(), [`--arcwayfarer-command=${encodeURIComponent(command)}`])
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

function waitForBackend(url, timeoutMs = 60000) {
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
  let stderr = ''
  backendProc = spawn(exe, [], {
    cwd: path.dirname(exe),
    env: { ...process.env, ARCWAYFARER_WEB_DIR: path.join(process.resourcesPath, 'mobile-web') },
  })
  backendProc.stdout.on('data', (d) => process.stdout.write(`[backend] ${d}`))
  backendProc.stderr.on('data', (d) => {
    const output = d.toString()
    // Keep enough of the Python/PyInstaller error to make a packaged-launch
    // failure actionable without putting an unbounded amount in the dialog.
    stderr = (stderr + output).slice(-8000)
    process.stderr.write(`[backend] ${output}`)
  })
  backendProc.on('exit', (code) => {
    console.log('[electron] backend exited with code', code)
    backendProc = null
  })

  const proc = backendProc
  const startupFailure = new Promise((_, reject) => {
    proc.once('error', (err) => {
      reject(new Error(`Could not launch the bundled backend (${err.message}).`))
    })
    proc.once('exit', (code, signal) => {
      const status = signal ? `signal ${signal}` : `code ${code}`
      const details = stderr.trim()
      reject(new Error(
        `Bundled backend exited before it became ready (${status}).` +
        (details ? `\n\nBackend output:\n${details}` : '')
      ))
    })
  })

  return Promise.race([
    waitForBackend('http://127.0.0.1:8787/health').catch((err) => {
      const details = stderr.trim()
      throw new Error(err.message + (details ? `\n\nBackend output:\n${details}` : ''))
    }),
    startupFailure,
  ])
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

async function offerRendererRecovery(reason) {
  const window = mainWindow
  if (!window || window.isDestroyed() || rendererRecoveryPromptOpen) return

  rendererRecoveryPromptOpen = true
  try {
    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      title: 'ArcWayfarer 介面沒有回應',
      message: 'ArcWayfarer 介面沒有回應',
      detail: `${reason}\n\n重新載入只會重建操作介面；背景中的裝置任務會繼續執行並在載入後重新同步。`,
      buttons: ['重新載入介面', '稍後'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })
    if (response === 0 && !window.isDestroyed()) {
      window.webContents.reloadIgnoringCache()
    }
  } finally {
    rendererRecoveryPromptOpen = false
  }
}

ipcMain.on('renderer-heartbeat', (event) => {
  if (isTrustedIpcSender(event)) {
    lastRendererHeartbeatAt = Date.now()
  }
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url).catch((error) => {
      console.error('[electron] could not open external URL:', error.message)
    })
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isTrustedAppUrl(url)) return
    event.preventDefault()
    void openExternalUrl(url).catch((error) => {
      console.error('[electron] could not open external navigation:', error.message)
    })
  })

  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  // Chromium intentionally throttles background renderers. Tell the page when
  // a minimized window becomes drawable again so map engines can re-measure
  // their canvas without keeping the GPU busy for the entire background stay.
  mainWindow.on('restore', () => {
    const restoredAt = Date.now()
    mainWindow?.webContents.send('window-restored')
    if (rendererRecoveryTimer) clearTimeout(rendererRecoveryTimer)
    rendererRecoveryTimer = setTimeout(() => {
      rendererRecoveryTimer = null
      if (lastRendererHeartbeatAt < restoredAt) {
        void offerRendererRecovery('視窗恢復後仍無法更新，可能是地圖繪製或介面更新程序卡住。')
      }
    }, 5000)
  })
  mainWindow.on('unresponsive', () => {
    console.error('[electron] main window became unresponsive')
    void offerRendererRecovery('介面程序已停止回應。')
  })
  mainWindow.webContents.on('render-process-gone', (_, details) => {
    console.error('[electron] renderer process exited:', details.reason, details.exitCode)
    if (details.reason !== 'clean-exit') {
      void offerRendererRecovery(`介面程序已結束（${details.reason}）。`)
    }
  })
  mainWindow.on('closed', () => {
    if (rendererRecoveryTimer) clearTimeout(rendererRecoveryTimer)
    rendererRecoveryTimer = null
    mainWindow = null
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(async () => {
  if (isStartupSmokeTest) {
    console.log(`[electron] startup smoke test passed (Electron ${process.versions.electron}, Chromium ${process.versions.chrome})`)
    app.quit()
    return
  }

  session.defaultSession.setPermissionCheckHandler((webContents, permission, _requestingOrigin, details) => (
    isTrustedPermissionSource(webContents, details) &&
    ALLOWED_RENDERER_PERMISSIONS.has(permission)
  ))
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(isTrustedPermissionSource(webContents, details) && ALLOWED_RENDERER_PERMISSIONS.has(permission))
  })

  try {
    // On packaged macOS builds, request the administrator authorization before
    // showing any application UI. A remote iOS device cannot be used until
    // tunneld is running, so opening a half-ready frontend is misleading.
    await startTunneld()
    await startBackend()
  } catch (err) {
    console.error('[electron] Startup failed:', err.message)
    const gatekeeperHint = process.platform === 'darwin'
      ? '\n\n如果這是首次開啟 ArcWayfarer：\n1. 關閉此視窗\n2. 前往「系統設定 → 隱私權與安全性」\n3. 找到「已阻擋 ArcWayfarer」→ 點「仍要打開」\n4. 重新啟動 ArcWayfarer\n\nIf this is your first launch, macOS may be scanning the app.\nGo to System Settings → Privacy & Security → click "Open Anyway", then relaunch.'
      : ''
    dialog.showErrorBox(
      'Startup Error',
      'ArcWayfarer could not obtain the required tunnel permission or start its backend.\n\n' + err.message + gatekeeperHint
    )
    app.quit()
    return
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
