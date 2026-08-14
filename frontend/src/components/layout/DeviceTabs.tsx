import { useState } from 'react'
import { ActionIcon, Tooltip } from '@mantine/core'
import { IconRefresh } from '@tabler/icons-react'
import type { Device } from '../../services/api'
import type { DeviceState, MapOverlay } from '../panels/types'
import type { Mode } from '../ModeSelector'
import type { LivePosition } from '../../hooks/useWebSocket'
import { useT, type StringKey } from '../../i18n'
import { calculateRouteProgressPct, formatEta } from '../panels/coords'

const RUNNING_STATES: DeviceState[] = ['teleporting', 'navigating', 'looping', 'random_walk', 'joystick']

const MODE_LABEL_KEYS: Record<Mode, StringKey> = {
  'teleport': 'mode.teleport',
  'navigate': 'mode.navigate',
  'route-loop': 'mode.route_loop',
  'multi-stop': 'mode.multi_stop',
  'random-walk': 'mode.random_walk',
  'joystick': 'mode.joystick',
}

const MODE_SHORT_NAMES: Record<Mode, string> = {
  'teleport': '瞬移',
  'navigate': '導航',
  'route-loop': '循環',
  'multi-stop': '巡迴',
  'random-walk': '漫遊',
  'joystick': '搖桿',
}

function statusColor(device: Device, state: DeviceState | undefined): string {
  if (device.status !== 'ready') return 'var(--mantine-color-gray-5)'
  if (state === 'paused') return 'var(--mantine-color-yellow-6)'
  if (state && RUNNING_STATES.includes(state)) return 'var(--mantine-color-blue-6)'
  return 'var(--mantine-color-green-6)'
}

function getStateLabel(state: DeviceState | undefined, mode: Mode | undefined, t: (key: StringKey) => string): string {
  if (!state || state === 'idle') return t('statusbar.standby')
  if (state === 'paused') return t('panel.paused')
  if (state === 'looping') return t('routeloop.status.looping')
  if (state === 'random_walk') return t('randomwalk.status.wandering')
  if (state === 'joystick') return t('joystick.status.active')
  if (state === 'navigating') {
    if (mode === 'multi-stop') return t('multistop.status.visiting')
    return t('navigate.status.running')
  }
  return state
}

type Props = {
  devices: Device[]
  focusedDeviceId: string | null
  onFocusChange: (udid: string) => void
  deviceStates: Record<string, DeviceState>
  modeByDevice?: Record<string, Mode>
  positions?: Record<string, LivePosition>
  overlaysByDevice?: Record<string, MapOverlay>
  loading: boolean
  onRefresh: () => void
}

export function DeviceTabs({
  devices,
  focusedDeviceId,
  onFocusChange,
  deviceStates,
  modeByDevice = {},
  positions = {},
  overlaysByDevice = {},
  loading,
  onRefresh,
}: Props) {
  const t = useT()
  const [hoveredUdid, setHoveredUdid] = useState<string | null>(null)

  return (
    <div className="device-tabs">
      {devices.length === 0 && (
        <span className="device-tabs-empty">{loading ? t('device.searching') : t('device.none')}</span>
      )}
      {devices.map((device) => {
        const state = deviceStates[device.udid] ?? 'idle'
        const mode = modeByDevice[device.udid] || 'teleport'
        const pos = positions[device.udid]
        const overlay = overlaysByDevice[device.udid]

        const isRunning = RUNNING_STATES.includes(state)
        const isPaused = state === 'paused'
        const isActive = isRunning || isPaused

        let pct: number | null = null
        if (isActive && (mode === 'route-loop' || mode === 'multi-stop' || mode === 'navigate')) {
          pct = calculateRouteProgressPct(
            overlay?.path,
            overlay?.markers,
            pos ? { lat: pos.lat, lng: pos.lng } : null,
            pos?.stopIndex,
            overlay?.markers?.length || 2,
            mode === 'route-loop'
          )
        }

        const totalStops = overlay?.markers?.length || 0
        const stopIndex = pos?.stopIndex

        return (
          <div
            key={device.udid}
            className="device-tab-wrapper"
            onMouseEnter={() => setHoveredUdid(device.udid)}
            onMouseLeave={() => setHoveredUdid(null)}
          >
            <button
              className={`device-tab${device.udid === focusedDeviceId ? ' active' : ''}`}
              onClick={() => onFocusChange(device.udid)}
              title={device.detail ?? undefined}
            >
              <span className="device-tab-dot" style={{ background: statusColor(device, state) }} />
              <span className="device-tab-name">{device.name}</span>
              {isActive && (
                <span className="device-tab-mini-badge">
                  {MODE_SHORT_NAMES[mode] || mode} {pct !== null ? `${pct}%` : ''}
                </span>
              )}
            </button>

            {hoveredUdid === device.udid && (
              <div className="device-tab-hover-card">
                <div className="hover-card-header">
                  <span className="hover-card-title">{device.name}</span>
                  <span className={`hover-card-status ${state}`}>
                    {getStateLabel(state, mode, t)}
                  </span>
                </div>
                <div className="hover-card-mode-row">
                  <span>{t(MODE_LABEL_KEYS[mode])}</span>
                  {pct !== null && <span className="hover-card-pct">{pct}%</span>}
                </div>
                {pct !== null && (
                  <div className="hover-card-progress-bar">
                    <div className="hover-card-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                )}
                <div className="hover-card-details">
                  {stopIndex && totalStops > 0 ? (
                    <span>{t('multistop.stop_progress')} {stopIndex} / {totalStops}</span>
                  ) : null}
                  {pos?.etaSeconds !== undefined && pos.etaSeconds > 0 ? (
                    <span>ETA {formatEta(pos.etaSeconds)}</span>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        )
      })}
      <Tooltip label={t('device.rescan')}>
        <ActionIcon className="device-refresh" variant="default" color="gray" loading={loading} onClick={onRefresh} aria-label={t('device.rescan')}>
          <IconRefresh size={16} />
        </ActionIcon>
      </Tooltip>
    </div>
  )
}
