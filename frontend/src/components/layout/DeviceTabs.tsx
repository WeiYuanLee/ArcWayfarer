import type { Device } from '../../services/api'
import type { DeviceState } from '../panels/types'
import { useT } from '../../i18n'

const RUNNING_STATES: DeviceState[] = ['teleporting', 'navigating', 'looping', 'random_walk', 'joystick']

function statusColor(device: Device, state: DeviceState | undefined): string {
  if (device.status !== 'ready') return '#666'
  if (state === 'paused') return '#e0a555'
  if (state && RUNNING_STATES.includes(state)) return '#4a9af0'
  return '#4caf50'
}

type Props = {
  devices: Device[]
  focusedDeviceId: string | null
  onFocusChange: (udid: string) => void
  deviceStates: Record<string, DeviceState>
  loading: boolean
  onRefresh: () => void
}

export function DeviceTabs({ devices, focusedDeviceId, onFocusChange, deviceStates, loading, onRefresh }: Props) {
  const t = useT()

  return (
    <div className="device-tabs">
      {devices.length === 0 && (
        <span className="device-tabs-empty">{loading ? t('device.searching') : t('device.none')}</span>
      )}
      {devices.map((device) => (
        <button
          key={device.udid}
          className={`device-tab${device.udid === focusedDeviceId ? ' active' : ''}`}
          onClick={() => onFocusChange(device.udid)}
          title={device.detail ?? undefined}
        >
          <span className="device-tab-dot" style={{ background: statusColor(device, deviceStates[device.udid]) }} />
          {device.name}
        </button>
      ))}
      <button className="device-refresh" onClick={onRefresh} disabled={loading} title={t('device.rescan')}>
        ⟳
      </button>
    </div>
  )
}
