import { useState } from 'react'
import { ModeSelector, type Mode } from '../ModeSelector'
import { PANEL_BY_MODE } from '../panels'
import type { PanelProps } from '../panels/types'
import type { Device } from '../../services/api'
import { FloatingCard } from './FloatingCard'
import { useT, type StringKey } from '../../i18n'

type Props = {
  devices: Device[]
  focusedDeviceId: string | null
  modeByDevice: Record<string, Mode>
  onModeChange: (udid: string, mode: Mode) => void
  panelPropsFor: (udid: string) => PanelProps
}

const MODE_LABEL_KEYS: Record<Mode, StringKey> = {
  'teleport': 'mode.teleport',
  'navigate': 'mode.navigate',
  'route-loop': 'mode.route_loop',
  'multi-stop': 'mode.multi_stop',
  'random-walk': 'mode.random_walk',
  'joystick': 'mode.joystick',
}

export function ControlsOverlay({ devices, focusedDeviceId, modeByDevice, onModeChange, panelPropsFor }: Props) {
  const t = useT()
  const [panelExpanded, setPanelExpanded] = useState(true)
  const focusedMode: Mode = (focusedDeviceId && modeByDevice[focusedDeviceId]) || 'teleport'

  return (
    <div className="map-overlay-container">
      {focusedDeviceId && (
        <div className="overlay-top-center">
          <ModeSelector value={focusedMode} onChange={(mode) => onModeChange(focusedDeviceId, mode)} />
        </div>
      )}

      <div className="overlay-panel-dock">
        {panelExpanded ? (
          <FloatingCard className={`overlay-panel-card${focusedMode === 'multi-stop' ? ' overlay-panel-card--scrollable' : ''}`}>
            <button
              className="panel-collapse-toggle"
              type="button"
              onClick={(event) => { event.stopPropagation(); setPanelExpanded(false) }}
              aria-label={t('overlay.collapse_panel')}
            >
              ▾
            </button>
            {devices.length === 0 && <p className="panel-hint">{t('panel.hint.select_device')}</p>}
            {devices.map((device) => {
              const mode = modeByDevice[device.udid] || 'teleport'
              const Panel = PANEL_BY_MODE[mode]
              return (
                <div key={device.udid} style={{ display: device.udid === focusedDeviceId ? 'contents' : 'none' }}>
                  <Panel {...panelPropsFor(device.udid)} />
                </div>
              )
            })}
          </FloatingCard>
        ) : (
          <button
            className="panel-expand-toggle"
            type="button"
            onClick={(event) => { event.stopPropagation(); setPanelExpanded(true) }}
            aria-label={t('overlay.expand_panel')}
          >
            ▸ {t(MODE_LABEL_KEYS[focusedMode])}
          </button>
        )}
      </div>
    </div>
  )
}
