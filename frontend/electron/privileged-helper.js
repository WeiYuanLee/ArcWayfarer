function run(argv) {
  if (argv.length !== 1) throw new Error('Expected one shell command')

  const app = Application.currentApplication()
  app.includeStandardAdditions = true
  return app.doShellScript(argv[0], { administratorPrivileges: true })
}
