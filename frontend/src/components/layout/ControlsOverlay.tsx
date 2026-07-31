import { useState } from 'react'
import { ModeSelector, type Mode } from '../ModeSelector'
import { PANEL_BY_MODE } from '../panels'
import type { PanelProps } from '../panels/types'
import type { Device } from '../../services/api'
import { FloatingCard } from './FloatingCard'
import { useT } from '../../i18n'

type Props = {
  devices: Device[]
  focusedDeviceId: string | null
  modeByDevice: Record<string, Mode>
  onModeChange: (udid: string, mode: Mode) => void
  panelPropsFor: (udid: string) => PanelProps
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
          <FloatingCard className="overlay-panel-card">
            <button
              className="panel-collapse-toggle"
              onClick={() => setPanelExpanded(false)}
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
            onClick={() => setPanelExpanded(true)}
            aria-label={t('overlay.expand_panel')}
          >
            ▸ {focusedMode.replace('-', ' ')}
          </button>
        )}
      </div>
    </div>
  )
}
