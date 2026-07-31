import { DeviceTabs } from './DeviceTabs'
import { ConnectionStatus } from '../ConnectionStatus'
import { DevMenuButton } from './DevMenuButton'
import type { Device } from '../../services/api'
import type { DeviceState } from '../panels/types'

type Props = {
  connected: boolean
  focusedDeviceId: string | null
  onFocusChange: (udid: string) => void
  devices: Device[]
  deviceStates: Record<string, DeviceState>
  devicesLoading: boolean
  onRefreshDevices: () => void
}

export function TopBar({
  connected,
  focusedDeviceId,
  onFocusChange,
  devices,
  deviceStates,
  devicesLoading,
  onRefreshDevices,
}: Props) {
  return (
    <div className="top-bar">
      <DevMenuButton deviceId={focusedDeviceId} />
      <h1>ArcWayfarer</h1>
      <DeviceTabs
        devices={devices}
        focusedDeviceId={focusedDeviceId}
        onFocusChange={onFocusChange}
        deviceStates={deviceStates}
        loading={devicesLoading}
        onRefresh={onRefreshDevices}
      />
      <ConnectionStatus connected={connected} />
    </div>
  )
}
