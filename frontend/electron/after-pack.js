const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  // macOS labels authorization dialogs with the invoking app's bundle name.
  // Compile a tiny JXA applet named ArcWayfarer instead of invoking /usr/bin/osascript,
  // which otherwise makes the system dialog say "osascript".
  const helperPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources', 'ArcWayfarer.app')
  const sourcePath = path.join(context.packager.projectDir, 'electron', 'privileged-helper.js')
  execFileSync('/usr/bin/osacompile', ['-l', 'JavaScript', '-o', helperPath, sourcePath])
}
