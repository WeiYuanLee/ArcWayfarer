import { useEffect, useState } from 'react'
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
      <div className="panel-header-row">
        <h2>{t('randomwalk.title')}</h2>
        <ModeInfoTooltip description={t('randomwalk.description')} />
      </div>

      <div className="panel-scroll-body">
      {!deviceId && <p className="panel-hint">{t('panel.hint.select_device')}</p>}
      {deviceId && !deviceReady && (
        <p className="panel-hint warning">{device?.detail ?? t('panel.hint.device_not_ready')}</p>
      )}
      {deviceState === 'teleporting' && (
        <p className="panel-hint warning">{t('panel.hint.teleporting')}</p>
      )}

      <div className="coord-row">
        <span>C</span>
        <input
          type="text"
          placeholder="Center (lat, lng or URL)"
          value={centerText}
          onFocus={() =>
            requestPoint((lat, lng) => {
              setCenter({ lat, lng })
              setCenterText(formatPoint({ lat, lng }))
            })
          }
          onChange={(e) => handleCenterTextChange(e.target.value)}
        />
      </div>

      <div className="coord-row">
        <span>Radius (m)</span>
        <input
          type="number"
          min={1}
          value={radius}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setRadius(Number(e.target.value))}
        />
      </div>

      <div className="panel-quick-actions">
        {[50, 100, 300, 500].map((r) => (
          <button
            key={r}
            className={`swap-button ${radius === r ? 'active' : ''}`}
            onClick={() => setRadius(r)}
          >
            {`${r}m`}
          </button>
        ))}
      </div>

      <SwitchBar
        label={t('multistop.straight_line')}
        checked={straightLine}
        onChange={setStraightLine}
        disabled={isActive}
      />

      <SwitchBar
        label={t('panel.pause_toggle')}
        checked={pauseEnabled}
        onChange={setPauseEnabled}
        disabled={isActive}
      />
      {pauseEnabled && (
        <div className="coord-row">
          <span>{t('panel.sec_label')}</span>
          <input
            type="number"
            min={0}
            value={pauseMin}
            disabled={isActive}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setPauseMin(Number(e.target.value))}
          />
          <span>–</span>
          <input
            type="number"
            min={0}
            value={pauseMax}
            disabled={isActive}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setPauseMax(Number(e.target.value))}
          />
        </div>
      )}

      <SpeedSlider
        valueKmh={speedKmh}
        navMode={navMode}
        onChange={setSpeedKmh}
        onNavModeChange={setNavMode}
        disabled={isActive}
      />
      </div>

      <PlaybackControls
        canStart={canStart}
        isActive={isActive}
        isPaused={isPaused}
        isBusy={isBusy}
        onStart={handleStart}
        onPauseResume={handlePauseResume}
        onStop={handleStop}
      />

      {status.kind === 'busy' && <p className="panel-status">{t('generic.working')}</p>}
      {isRunning && <p className="panel-status ok">{t('randomwalk.status.wandering')}</p>}
      {isPaused && <p className="panel-status warning">{t('panel.paused')}</p>}
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
    </div>
  )
}
