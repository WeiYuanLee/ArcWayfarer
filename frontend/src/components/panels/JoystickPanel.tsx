import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Badge, Button, SegmentedControl, Text } from '@mantine/core'
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
import { ModePanelLayout, PanelFooter, PanelNotice, PanelSection, PanelStatus } from './ui'

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
      <ModePanelLayout
        title={t('joystick.title')}
        headerAction={<ModeInfoTooltip description={t('joystick.description')} />}
        notices={<>
          {!deviceId && <PanelNotice>{t('panel.hint.select_device')}</PanelNotice>}
          {deviceId && !deviceReady && <PanelNotice tone="warning">{device?.detail ?? t('panel.hint.device_not_ready')}</PanelNotice>}
          {deviceId && deviceReady && !isActive && !startPoint && <PanelNotice tone="warning">{t('joystick.hint.need_anchor')}</PanelNotice>}
        </>}
        footer={<PanelFooter justify="flex-end">
          {!isActive
            ? <Button disabled={!canStart} loading={isBusy} onClick={handleStart}>{t('joystick.action.start')}</Button>
            : <Button color="red" disabled={isBusy} loading={isBusy} onClick={handleStop}>{t('joystick.action.stop')}</Button>}
        </PanelFooter>}
        status={status.kind === 'busy' ? <PanelStatus state="busy" message={t('generic.working')} /> : status.kind === 'error' ? <PanelStatus state="error" message={status.message} /> : isActive ? <PanelStatus state="success" message={t('joystick.status.active')} /> : undefined}
      >
        <PanelSection>
          <SegmentedControl
            fullWidth size="xs" disabled={isActive} value={subTab}
            onChange={(value) => setSubTab(value as SubTab)}
            data={[{ label: t('joystick.tab.basic'), value: 'basic' }, { label: t('joystick.tab.dynamic'), value: 'dynamic' }]}
          />
        </PanelSection>
        {subTab === 'basic' ? (
          <PanelSection title={t('statusbar.speed')}>
            <SpeedSlider valueKmh={speedKmh} navMode={navMode} onChange={setSpeedKmh} onNavModeChange={setNavMode} disabled={isActive} />
          </PanelSection>
        ) : (
          <PanelSection title={t('joystick.dynamic.speed_range')}>
            <Badge variant="light">0–{DYNAMIC_MAX_SPEED_KMH} km/h</Badge>
            <Text size="xs" c="dimmed">{t('joystick.dynamic.description')}</Text>
          </PanelSection>
        )}
      </ModePanelLayout>
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
