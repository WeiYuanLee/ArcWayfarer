import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Badge, Button, SegmentedControl } from '@mantine/core'
import { pushHistory, startJoystick, stopJoystick, type NavMode } from '../../services/api'
import type { PanelProps } from './types'
import { EMPTY_OVERLAY } from './types'
import { SpeedSlider } from './SpeedSlider'
import { JoystickPad } from './JoystickPad'
import { useJoystickKeyboard } from '../../hooks/useJoystickKeyboard'
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu'
import { ModeInfoTooltip } from '../common/ModeInfoTooltip'
import { showToast } from '../common/Toast'
import { useT } from '../../i18n'

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string }
type SubTab = 'basic' | 'dynamic'
const DYNAMIC_MAX_SPEED_KMH = 60

export function JoystickPanel({ deviceId, device, deviceState, point, livePosition, sendWs, setPoint, setOverlay }: PanelProps) {
  const t = useT()
  const [subTab, setSubTab] = useState<SubTab>('basic')
  const [navMode, setNavMode] = useState<NavMode>('walk')
  const [speedKmh, setSpeedKmh] = useState(5)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; title?: string; items: ContextMenuItem[] } | null>(null)

  const deviceReady = device?.status === 'ready'
  const isActive = deviceState === 'joystick'
  const isDynamic = subTab === 'dynamic'
  const isBusy = status.kind === 'busy'

  // Auto fallback to livePosition if point is null
  const startPoint = point ?? livePosition
  const canStart = deviceReady && !isActive && startPoint !== null && !isBusy

  useEffect(() => {
    setOverlay({
      markers: [],
      path: [],
      onMapContextMenu: ({ lat, lng, clientX, clientY }) => {
        const clickedPoint = { lat, lng }
        setContextMenu({
          x: clientX,
          y: clientY,
          title: `地圖位置 (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          items: [
            {
              id: 'set-joystick-anchor',
              label: t('contextmenu.set_joystick_anchor'),
              disabled: isActive,
              onClick: () => setPoint(clickedPoint),
            },
            {
              id: 'copy-map-coords',
              label: t('contextmenu.copy_coords_short'),
              onClick: () => {
                navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)
                showToast(t('toast.copied_coords'))
              },
            },
          ],
        })
      },
    })
    return () => setOverlay(EMPTY_OVERLAY)
  }, [isActive, setOverlay, setPoint, t])

  const handleMove = useCallback(
    (direction: number, intensity: number) => {
      if (!deviceId) return
      sendWs('joystick_input', { direction, intensity }, deviceId)
    },
    [deviceId, sendWs]
  )

  useJoystickKeyboard(handleMove, isActive, isDynamic)

  async function handleStart() {
    if (!deviceId || !startPoint) return
    setStatus({ kind: 'busy' })
    try {
      await startJoystick(
        deviceId,
        navMode,
        startPoint.lat,
        startPoint.lng,
        isDynamic ? DYNAMIC_MAX_SPEED_KMH : speedKmh
      )
      pushHistory({ lat: startPoint.lat, lng: startPoint.lng, kind: 'joystick' }).catch(() => {})
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('joystick.status.failed_start') })
    }
  }

  async function handleStop() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      await stopJoystick(deviceId)
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('joystick.status.failed_stop') })
    }
  }

  return (
    <div className="panel">
      <div className="panel-header-row">
        <h2>{t('joystick.title')}</h2>
        <ModeInfoTooltip description={t('joystick.description')} />
      </div>

      {!deviceId && <p className="panel-hint">{t('panel.hint.select_device')}</p>}
      {deviceId && !deviceReady && (
        <p className="panel-hint warning">{device?.detail ?? t('panel.hint.device_not_ready')}</p>
      )}
      {deviceId && deviceReady && !isActive && !startPoint && (
        <p className="panel-hint warning">{t('joystick.hint.need_anchor')}</p>
      )}

      {/* Sub-Tab Bar for Basic vs Dynamic mode setup */}
      <SegmentedControl
        fullWidth size="xs" disabled={isActive} value={subTab}
        onChange={(value) => setSubTab(value as SubTab)}
        data={[{ label: t('joystick.tab.basic'), value: 'basic' }, { label: t('joystick.tab.dynamic'), value: 'dynamic' }]}
      />

      {subTab === 'basic' ? (
        <SpeedSlider
          valueKmh={speedKmh}
          navMode={navMode}
          onChange={setSpeedKmh}
          onNavModeChange={setNavMode}
          disabled={isActive}
        />
      ) : (
        <div className="dynamic-settings-group">
          <div className="setting-row">
            <span className="setting-label">{t('joystick.dynamic.speed_range')}</span>
            <Badge variant="light">0–{DYNAMIC_MAX_SPEED_KMH} km/h</Badge>
          </div>
          <p className="panel-hint">{t('joystick.dynamic.description')}</p>
        </div>
      )}

      <div className="panel-actions icon-actions">
        {!isActive ? (
          <Button fullWidth disabled={!canStart} onClick={handleStart}>{t('joystick.action.start')}</Button>
        ) : (
          <Button fullWidth color="red" disabled={isBusy} onClick={handleStop}>{t('joystick.action.stop')}</Button>
        )}
      </div>

      {status.kind === 'busy' && <p className="panel-status">{t('generic.working')}</p>}
      {isActive && <p className="panel-status ok">{t('joystick.status.active')}</p>}
      {status.kind === 'error' && <p className="panel-status error">{status.message}</p>}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          title={contextMenu.title}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {isActive &&
        createPortal(
          <div className="joystick-float-dock">
            <JoystickPad
              onMove={handleMove}
              dynamic={isDynamic}
              maxSpeedKmh={isDynamic ? DYNAMIC_MAX_SPEED_KMH : speedKmh}
            />
          </div>,
          document.body
        )}
    </div>
  )
}
