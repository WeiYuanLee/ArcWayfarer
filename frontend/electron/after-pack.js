const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)

  // electron-builder enables arbitrary network loads while adding its
  // localhost exception. ArcWayfarer only needs plain HTTP for its bundled
  // loopback backend, so restore App Transport Security for every other host.
  const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist')
  execFileSync('/usr/bin/plutil', [
    '-replace',
    'NSAppTransportSecurity.NSAllowsArbitraryLoads',
    '-bool',
    'NO',
    infoPlistPath,
  ])

  // These descriptions ship in Electron's template but ArcWayfarer never
  // requests the corresponding permissions. Removing them keeps the packaged
  // privacy declaration aligned with the permission-deny policy in main.js.
  for (const key of [
    'NSAudioCaptureUsageDescription',
    'NSBluetoothAlwaysUsageDescription',
    'NSBluetoothPeripheralUsageDescription',
    'NSCameraUsageDescription',
    'NSMicrophoneUsageDescription',
  ]) {
    try {
      execFileSync('/usr/bin/plutil', ['-remove', key, infoPlistPath])
    } catch {
      // The base Electron template can remove these keys in a future release.
    }
  }

  // macOS labels authorization dialogs with the invoking app's bundle name.
  // Compile a tiny JXA applet named ArcWayfarer instead of invoking /usr/bin/osascript,
  // which otherwise makes the system dialog say "osascript".
  const helperPath = path.join(appPath, 'Contents', 'Resources', 'ArcWayfarer.app')
  const sourcePath = path.join(context.packager.projectDir, 'electron', 'privileged-helper.js')
  execFileSync('/usr/bin/osacompile', ['-l', 'JavaScript', '-o', helperPath, sourcePath])
}
