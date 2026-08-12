import { DeviceTabs } from './DeviceTabs'
import { ConnectionStatus } from '../ConnectionStatus'
import { DevMenuButton } from './DevMenuButton'
import { VersionBadge } from '../common/VersionBadge'
import type { Device } from '../../services/api'
import type { DeviceState, MapOverlay } from '../panels/types'
import type { Mode } from '../ModeSelector'
import type { LivePosition } from '../../hooks/useWebSocket'
import { useT } from '../../i18n'

type Props = {
  connected: boolean
  focusedDeviceId: string | null
  onFocusChange: (udid: string) => void
  devices: Device[]
  deviceStates: Record<string, DeviceState>
  modeByDevice?: Record<string, Mode>
  positions?: Record<string, LivePosition>
  overlaysByDevice?: Record<string, MapOverlay>
  devicesLoading: boolean
  onRefreshDevices: () => void
  onOpenCmdPalette?: () => void
  version: string
  hasUpdate: boolean
  latestVersion?: string
  loadingUpdate: boolean
  onOpenUpdateModal: () => void
}

export function TopBar({
  connected,
  focusedDeviceId,
  onFocusChange,
  devices,
  deviceStates,
  modeByDevice,
  positions,
  overlaysByDevice,
  devicesLoading,
  onRefreshDevices,
  onOpenCmdPalette,
  version,
  hasUpdate,
  latestVersion,
  loadingUpdate,
  onOpenUpdateModal,
}: Props) {
  const t = useT()

  return (
    <div className="top-bar">
      <DevMenuButton deviceId={focusedDeviceId} />
      <div className="topbar-title-group">
        <h1>{t('topbar.title')}</h1>
        <VersionBadge
          version={version}
          hasUpdate={hasUpdate}
          latestVersion={latestVersion}
          loading={loadingUpdate}
          onClick={onOpenUpdateModal}
        />
      </div>

      <button className="topbar-cmd-palette-btn" onClick={onOpenCmdPalette} title="Command Palette (Cmd+K)">
        <span className="search-icon">🔍</span>
        <span className="search-text">{t('topbar.search')}</span>
        <kbd className="cmd-k-kbd">⌘K</kbd>
      </button>

      <DeviceTabs
        devices={devices}
        focusedDeviceId={focusedDeviceId}
        onFocusChange={onFocusChange}
        deviceStates={deviceStates}
        modeByDevice={modeByDevice}
        positions={positions}
        overlaysByDevice={overlaysByDevice}
        loading={devicesLoading}
        onRefresh={onRefreshDevices}
      />
      <ConnectionStatus connected={connected} />
    </div>
  )
}
