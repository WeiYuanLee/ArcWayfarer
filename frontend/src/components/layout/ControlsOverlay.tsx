import { memo, Suspense, useEffect, useRef, useState } from 'react'
import { ModeSelector, type Mode } from '../ModeSelector'
import { PANEL_BY_MODE } from '../panels'
import type { PanelProps } from '../panels/types'
import type { Device } from '../../services/api'
import { FloatingCard } from './FloatingCard'
import { useT, type StringKey } from '../../i18n'
import { usePikminMap } from '../map/PikminMapContext'

type Props = {
  devices: Device[]
  focusedDeviceId: string | null
  modeByDevice: Record<string, Mode>
  onModeChange: (udid: string, mode: Mode) => void
  panelPropsFor: (udid: string) => PanelProps
  modeChangeLocked?: boolean
}

type WorkspaceProps = {
  deviceId: string
  focused: boolean
  mode: Mode
  panelProps: PanelProps
  loadingLabel: string
}

function shallowEqualPanelProps(left: PanelProps, right: PanelProps): boolean {
  const keys = Object.keys(left) as (keyof PanelProps)[]
  return keys.length === Object.keys(right).length && keys.every((key) => Object.is(left[key], right[key]))
}

const DevicePanelWorkspace = memo(function DevicePanelWorkspace({ deviceId, focused, mode, panelProps, loadingLabel }: WorkspaceProps) {
  const Panel = PANEL_BY_MODE[mode]
  return (
    <div key={deviceId} className={focused ? 'device-panel-workspace--focused' : undefined} style={{ display: focused ? 'contents' : 'none' }}>
      <Suspense fallback={<p className="panel-hint">{loadingLabel}</p>}>
        <Panel {...panelProps} />
      </Suspense>
    </div>
  )
}, (previous, next) => (
  previous.deviceId === next.deviceId &&
  previous.focused === next.focused &&
  previous.mode === next.mode &&
  previous.loadingLabel === next.loadingLabel &&
  shallowEqualPanelProps(previous.panelProps, next.panelProps)
))

const MODE_LABEL_KEYS: Record<Mode, StringKey> = {
  'teleport': 'mode.teleport',
  'navigate': 'mode.navigate',
  'route-loop': 'mode.route_loop',
  'multi-stop': 'mode.multi_stop',
  'random-walk': 'mode.random_walk',
  'joystick': 'mode.joystick',
}

export function ControlsOverlay({ devices, focusedDeviceId, modeByDevice, onModeChange, panelPropsFor, modeChangeLocked = false }: Props) {
  const t = useT()
  const pikminMap = usePikminMap()
  const [panelExpanded, setPanelExpanded] = useState(true)
  const panelExpandedBeforeDrawer = useRef(true)
  const drawerOpen = pikminMap.mode !== null
  const focusedMode: Mode = (focusedDeviceId && modeByDevice[focusedDeviceId]) || 'teleport'

  useEffect(() => {
    if (drawerOpen) {
      panelExpandedBeforeDrawer.current = panelExpanded
      setPanelExpanded(false)
    } else {
      setPanelExpanded(panelExpandedBeforeDrawer.current)
    }
    // Opening/closing the drawer is the transition boundary. User changes to
    // the compact control while the drawer is open should not retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen])

  return (
    <div className="map-overlay-container">
      {focusedDeviceId && !drawerOpen && (
        <div className="overlay-top-center">
          <ModeSelector value={focusedMode} disabled={modeChangeLocked} onChange={(mode) => onModeChange(focusedDeviceId, mode)} />
        </div>
      )}

      <div className="overlay-panel-dock">
        {panelExpanded ? (
          <FloatingCard className={`overlay-panel-card${focusedMode === 'multi-stop' || focusedMode === 'route-loop' ? ' overlay-panel-card--scrollable' : ''}`}>
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
              return (
                <DevicePanelWorkspace
                  key={device.udid}
                  deviceId={device.udid}
                  focused={device.udid === focusedDeviceId}
                  mode={mode}
                  panelProps={panelPropsFor(device.udid)}
                  loadingLabel={t('generic.working')}
                />
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
