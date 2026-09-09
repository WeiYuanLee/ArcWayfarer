export interface PlatformInfo {
  platform: 'darwin' | 'win32' | 'linux' | string
  arch: 'arm64' | 'x64' | 'ia32' | string
  version: string
}

export interface ElectronAPI {
  getPlatformInfo: () => Promise<PlatformInfo>
  openExternal: (url: string) => Promise<void>
  onWindowRestored: (callback: () => void) => () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
