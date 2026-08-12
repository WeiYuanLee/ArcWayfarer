import APP_PACKAGE from '../../package.json'

export type PlatformEnv = 'mac-arm64' | 'mac-x64' | 'win-x64'

export interface ReleaseAsset {
  name: string
  downloadUrl: string
  size: number
}

export interface ReleaseInfo {
  version: string
  tagName: string
  htmlUrl: string
  releaseNotes: string
  publishedAt: string
  assets: ReleaseAsset[]
  downloadUrls: Record<PlatformEnv, string | null>
}

export interface CheckUpdateResult {
  currentVersion: string
  latestRelease: ReleaseInfo | null
  hasUpdate: boolean
  currentEnv: PlatformEnv
  error?: string
}

// GitHub repo configuration
const GITHUB_REPO_OWNER = 'WeiYuanLee'
const GITHUB_REPO_NAME = 'ArcWayfarer'
const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`

export const CURRENT_APP_VERSION = APP_PACKAGE.version || '0.1.0'

/**
 * Detect the current running platform environment (mac-arm64, mac-x64, win-x64)
 */
export async function getSystemEnvironment(): Promise<PlatformEnv> {
  if (typeof window !== 'undefined' && window.electronAPI?.getPlatformInfo) {
    try {
      const info = await window.electronAPI.getPlatformInfo()
      if (info.platform === 'win32') return 'win-x64'
      if (info.platform === 'darwin') {
        return info.arch === 'arm64' ? 'mac-arm64' : 'mac-x64'
      }
    } catch (err) {
      console.warn('Failed to get Electron platform info:', err)
    }
  }

  // Fallback to browser navigator
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const platform = typeof navigator !== 'undefined' ? navigator.platform : ''

  if (userAgent.includes('Win') || platform.includes('Win')) {
    return 'win-x64'
  }

  if (userAgent.includes('Mac') || platform.includes('Mac')) {
    // Modern Apple Silicon Macs running Chrome/Safari might report Intel in UA string for legacy reasons,
    // but check for arm hints if available.
    return 'mac-arm64'
  }

  return 'mac-arm64' // Default fallback
}

/**
 * Get current application version (from Electron or package.json)
 */
export async function getCurrentVersion(): Promise<string> {
  if (typeof window !== 'undefined' && window.electronAPI?.getPlatformInfo) {
    try {
      const info = await window.electronAPI.getPlatformInfo()
      if (info.version) return info.version
    } catch {
      // Fallback
    }
  }
  return CURRENT_APP_VERSION
}

/**
 * Clean version string (strips leading 'v', '-beta', etc. for numeric comparison)
 */
export function cleanVersion(ver: string): string {
  return ver.replace(/^v/i, '').trim()
}

/**
 * Compare semver strings: returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
  const clean1 = cleanVersion(v1)
  const clean2 = cleanVersion(v2)

  const parts1 = clean1.split('.').map((p) => parseInt(p, 10) || 0)
  const parts2 = clean2.split('.').map((p) => parseInt(p, 10) || 0)

  const maxLen = Math.max(parts1.length, parts2.length)
  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] || 0
    const num2 = parts2[i] || 0
    if (num1 > num2) return 1
    if (num1 < num2) return -1
  }

  return 0
}

/**
 * Parse release assets to map installer URLs for the 3 target environments
 */
function resolvePlatformDownloadUrls(assets: ReleaseAsset[], releaseHtmlUrl: string): Record<PlatformEnv, string | null> {
  let macArm64Url: string | null = null
  let macX64Url: string | null = null
  let winX64Url: string | null = null

  for (const asset of assets) {
    const name = asset.name.toLowerCase()
    
    // Windows installer (.exe)
    if (name.endsWith('.exe')) {
      if (!winX64Url) winX64Url = asset.downloadUrl
    }

    // macOS installer (.dmg)
    if (name.endsWith('.dmg')) {
      if (name.includes('arm64') || name.includes('aarch64')) {
        macArm64Url = asset.downloadUrl
      } else if (name.includes('x64') || name.includes('intel') || name.includes('x86_64')) {
        macX64Url = asset.downloadUrl
      } else {
        // If unspecified, assign as fallback for mac if not set
        if (!macArm64Url) macArm64Url = asset.downloadUrl
        if (!macX64Url) macX64Url = asset.downloadUrl
      }
    }
  }

  // Fallbacks if direct file download asset was not matched
  return {
    'mac-arm64': macArm64Url || releaseHtmlUrl,
    'mac-x64': macX64Url || releaseHtmlUrl,
    'win-x64': winX64Url || releaseHtmlUrl,
  }
}

/**
 * Check GitHub API for latest release
 */
export async function checkForUpdates(): Promise<CheckUpdateResult> {
  const currentEnv = await getSystemEnvironment()
  const currentVer = await getCurrentVersion()

  try {
    const response = await fetch(LATEST_RELEASE_API, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        return {
          currentVersion: currentVer,
          latestRelease: null,
          hasUpdate: false,
          currentEnv,
          error: '尚未發布 GitHub Release 記錄',
        }
      }
      throw new Error(`GitHub API returned status ${response.status}`)
    }

    const data = await response.json()
    const tagName = data.tag_name || ''
    const cleanTag = cleanVersion(tagName)

    const assets: ReleaseAsset[] = (data.assets || []).map((a: any) => ({
      name: a.name,
      downloadUrl: a.browser_download_url,
      size: a.size || 0,
    }))

    const downloadUrls = resolvePlatformDownloadUrls(assets, data.html_url || '')

    const releaseInfo: ReleaseInfo = {
      version: cleanTag,
      tagName: tagName,
      htmlUrl: data.html_url || `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`,
      releaseNotes: data.body || '',
      publishedAt: data.published_at || '',
      assets,
      downloadUrls,
    }

    const hasUpdate = compareVersions(cleanTag, currentVer) > 0

    return {
      currentVersion: currentVer,
      latestRelease: releaseInfo,
      hasUpdate,
      currentEnv,
    }
  } catch (err: any) {
    console.error('Failed to check for updates:', err)
    return {
      currentVersion: currentVer,
      latestRelease: null,
      hasUpdate: false,
      currentEnv,
      error: err.message || '無法連線至更新伺服器',
    }
  }
}

/**
 * Helper to open external download URL
 */
export async function openDownloadLink(url: string) {
  if (typeof window !== 'undefined' && window.electronAPI?.openExternal) {
    await window.electronAPI.openExternal(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
