import { useEffect, useState } from 'react'
import { Button, Group, NumberInput } from '@mantine/core'
import { pauseRandomWalk, pushHistory, resumeRandomWalk, setLocation, startRandomWalk, stopRandomWalk, type NavMode } from '../../services/api'
import type { LatLng, PanelProps } from './types'
import { EMPTY_OVERLAY } from './types'
import { formatPoint, parsePoint } from './coords'
import { SpeedSlider } from './SpeedSlider'
import { PlaybackControls } from './PlaybackControls'
import { SwitchBar } from '../common/SwitchBar'
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu'
import { ModeInfoTooltip } from '../common/ModeInfoTooltip'
import { showToast } from '../common/Toast'
import { useT } from '../../i18n'
import { CoordinateField, ModePanelLayout, NumberRangeField, PanelFooter, PanelNotice, PanelSection, PanelStatus } from './ui'

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string }

const CENTER_COLOR = '#4a9af0'

export function RandomWalkPanel({ deviceId, device, deviceState, livePosition, requestPoint, setOverlay }: PanelProps) {
  const t = useT()
  const [center, setCenter] = useState<LatLng | null>(null)
  const [centerText, setCenterText] = useState('')
  const [radius, setRadius] = useState(100)
  const [navMode, setNavMode] = useState<NavMode>('walk')
  const [speedKmh, setSpeedKmh] = useState(5)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [pauseEnabled, setPauseEnabled] = useState(false)
  const [pauseMin, setPauseMin] = useState(5)
  const [pauseMax, setPauseMax] = useState(20)
  const [straightLine, setStraightLine] = useState(true)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; title?: string; items: ContextMenuItem[] } | null>(null)

  const deviceReady = device?.status === 'ready'
  const isRunning = deviceState === 'random_walk'
  const isPaused = deviceState === 'paused'
  const isActive = isRunning || isPaused
  const isBusy = status.kind === 'busy'

  // Auto fill center with live position if empty
  useEffect(() => {
    if (!center && livePosition && !centerText) {
      setCenter(livePosition)
      setCenterText(formatPoint(livePosition))
    }
  }, [livePosition, center, centerText])

  const canStart = deviceReady && !isActive && center !== null && radius > 0 && !isBusy

  useEffect(() => {
    setOverlay({
      markers: center ? [{
        id: 'random-walk-center', lat: center.lat, lng: center.lng, color: CENTER_COLOR, label: 'C',
        draggable: !isActive,
        onDragEnd: (lat: number, lng: number) => {
          if (isActive) return
          const nextCenter = { lat, lng }
          setCenter(nextCenter)
          setCenterText(formatPoint(nextCenter))
        },
      }] : [],
      path: [],
      circle: center ? { lat: center.lat, lng: center.lng, radiusMeters: radius } : null,
      onMapContextMenu: ({ lat, lng, clientX, clientY }) => {
        const clickedPoint = { lat, lng }
        setContextMenu({
          x: clientX,
          y: clientY,
          title: `地圖位置 (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          items: [
            {
              id: 'set-random-center', label: t('contextmenu.set_random_center'), disabled: isActive,
              onClick: () => { setCenter(clickedPoint); setCenterText(formatPoint(clickedPoint)) },
            },
            {
              id: 'teleport-here', label: t('contextmenu.teleport_here'), disabled: deviceState !== 'idle' || !deviceId,
              onClick: async () => {
                if (!deviceId) return
                try { await setLocation(deviceId, lat, lng) }
                catch (e) { setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('randomwalk.status.failed_start') }) }
              },
            },
            {
              id: 'copy-map-coords', label: t('contextmenu.copy_coords_short'),
              onClick: () => { navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`); showToast(t('toast.copied_coords')) },
            },
          ],
        })
      },
    })
    return () => setOverlay(EMPTY_OVERLAY)
  }, [center, radius, isActive, deviceId, deviceState, setOverlay, t])

  function handleCenterTextChange(value: string) {
    setCenterText(value)
    const parsed = parsePoint(value)
    if (parsed) setCenter(parsed)
  }

  async function handleStart() {
    if (!deviceId || !center) return
    setStatus({ kind: 'busy' })
    try {
      await startRandomWalk(
        deviceId,
        navMode,
        center,
        radius,
        { enabled: pauseEnabled, min: pauseMin, max: pauseMax },
        speedKmh,
        straightLine
      )
      pushHistory({ lat: center.lat, lng: center.lng, kind: 'random_walk' }).catch(() => {})
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('randomwalk.status.failed_start') })
    }
  }

  async function handleStop() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      await stopRandomWalk(deviceId)
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('randomwalk.status.failed_stop') })
    }
  }

  async function handlePauseResume() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      if (isPaused) {
        await resumeRandomWalk(deviceId)
      } else {
        await pauseRandomWalk(deviceId)
      }
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('randomwalk.status.failed_update') })
    }
  }

  return (
    <div className="panel">
      <ModePanelLayout
        title={t('randomwalk.title')}
        headerAction={<ModeInfoTooltip description={t('randomwalk.description')} />}
        notices={<>
          {!deviceId && <PanelNotice>{t('panel.hint.select_device')}</PanelNotice>}
          {deviceId && !deviceReady && <PanelNotice tone="warning">{device?.detail ?? t('panel.hint.device_not_ready')}</PanelNotice>}
          {deviceState === 'teleporting' && <PanelNotice tone="warning">{t('panel.hint.teleporting')}</PanelNotice>}
        </>}
        footer={<PanelFooter><PlaybackControls canStart={canStart} isActive={isActive} isPaused={isPaused} isBusy={isBusy} onStart={handleStart} onPauseResume={handlePauseResume} onStop={handleStop} /></PanelFooter>}
        status={
          status.kind === 'busy' ? <PanelStatus state="busy" message={t('generic.working')} />
            : status.kind === 'error' ? <PanelStatus state="error" message={status.message} />
              : isPaused ? <PanelNotice tone="warning">{t('panel.paused')}</PanelNotice>
                : isRunning ? <PanelStatus state="success" message={t('randomwalk.status.wandering')} />
                  : undefined
        }
      >
        <PanelSection>
          <CoordinateField
            label="C"
            placeholder="Center (lat, lng or URL)"
            value={centerText}
            onFocus={() => requestPoint((lat, lng) => { setCenter({ lat, lng }); setCenterText(formatPoint({ lat, lng })) })}
            onChange={handleCenterTextChange}
          />
          <NumberInput label="Radius (m)" min={1} value={radius} disabled={isActive} onFocus={(event) => event.currentTarget.select()} onChange={(value) => setRadius(Number(value) || 0)} />
          <Group gap="xs">
            {[50, 100, 300, 500].map((value) => <Button key={value} size="xs" variant={radius === value ? 'filled' : 'default'} disabled={isActive} onClick={() => setRadius(value)}>{`${value}m`}</Button>)}
          </Group>
        </PanelSection>
        <PanelSection>
          <SwitchBar label={t('multistop.straight_line')} checked={straightLine} onChange={setStraightLine} disabled={isActive} />
          <SwitchBar label={t('panel.pause_toggle')} subLabel={pauseEnabled ? t('panel.pause_summary') : undefined} checked={pauseEnabled} onChange={setPauseEnabled} disabled={isActive} />
          {pauseEnabled && <NumberRangeField min={pauseMin} max={pauseMax} onMinChange={(value) => setPauseMin(Number(value) || 0)} onMaxChange={(value) => setPauseMax(Number(value) || 0)} minLabel={t('panel.pause_min')} maxLabel={t('panel.pause_max')} minProps={{ min: 0, disabled: isActive }} maxProps={{ min: 0, disabled: isActive }} />}
        </PanelSection>
        <PanelSection>
          <SpeedSlider valueKmh={speedKmh} navMode={navMode} onChange={setSpeedKmh} onNavModeChange={setNavMode} disabled={isActive} />
        </PanelSection>
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
    </div>
  )
}
