ObjC.import('Foundation')

function commandArguments(argv) {
  const args = Array.isArray(argv) ? argv.slice() : argv == null ? [] : [String(argv)]

  // When an osacompile applet is launched as an executable, macOS can invoke
  // `run` without its command-line parameters. NSProcessInfo remains the
  // authoritative source in both applet and osascript launch modes.
  const processArgs = $.NSProcessInfo.processInfo.arguments
  for (let index = 0; index < Number(processArgs.count); index += 1) {
    args.push(ObjC.unwrap(processArgs.objectAtIndex(index)))
  }

  return args
}

function run(argv) {
  // macOS applets can add their own launch arguments. Read only the explicitly
  // encoded command supplied by Electron instead of depending on argv length.
  const prefix = '--arcwayfarer-command='
  const args = commandArguments(argv)
  const encodedCommand = args.find((value) => value.indexOf(prefix) === 0)
  const command = encodedCommand ? decodeURIComponent(encodedCommand.slice(prefix.length)).trim() : ''
  if (!command) throw new Error('Missing shell command')

  const app = Application.currentApplication()
  app.includeStandardAdditions = true
  return app.doShellScript(command, { administratorPrivileges: true })
}
