import { useEffect, useState } from 'react'
import { pauseRouteLoop, pushHistory, resumeRouteLoop, startRouteLoop, stopRouteLoop, type NavMode } from '../../services/api'
import type { LatLng, PanelProps } from './types'
import { EMPTY_OVERLAY } from './types'
import { formatEta, formatPoint, parsePoint } from './coords'
import { SpeedSlider } from './SpeedSlider'
import { PlaybackControls } from './PlaybackControls'
import { useT } from '../../i18n'

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string }

const WAYPOINT_COLOR = '#4a9af0'

export function RouteLoopPanel({ deviceId, device, deviceState, liveEtaSeconds, requestPoint, setOverlay }: PanelProps) {
  const t = useT()
  const [waypoints, setWaypoints] = useState<(LatLng | null)[]>([null, null])
  const [texts, setTexts] = useState<string[]>(['', ''])
  const [navMode, setNavMode] = useState<NavMode>('walk')
  const [speedKmh, setSpeedKmh] = useState(5)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [routePath, setRoutePath] = useState<LatLng[]>([])
  const [pauseEnabled, setPauseEnabled] = useState(false)
  const [pauseMin, setPauseMin] = useState(5)
  const [pauseMax, setPauseMax] = useState(20)

  const deviceReady = device?.status === 'ready'
  const isRunning = deviceState === 'looping'
  const isPaused = deviceState === 'paused'
  const isActive = isRunning || isPaused
  const isBusy = status.kind === 'busy'
  const validWaypoints = waypoints.filter((w): w is LatLng => w !== null)
  const canStart = deviceReady && !isActive && validWaypoints.length >= 2 && !isBusy

  useEffect(() => {
    setOverlay({
      markers: waypoints
        .map((wp, idx) => (wp ? { id: `loop-${idx}`, lat: wp.lat, lng: wp.lng, color: WAYPOINT_COLOR, label: String(idx + 1) } : null))
        .filter((m): m is NonNullable<typeof m> => m !== null),
      path: routePath,
    })
    return () => setOverlay(EMPTY_OVERLAY)
  }, [waypoints, routePath, setOverlay])

  function updateWaypoint(idx: number, point: LatLng) {
    setWaypoints((prev) => prev.map((w, i) => (i === idx ? point : w)))
    setTexts((prev) => prev.map((txt, i) => (i === idx ? formatPoint(point) : txt)))
  }

  function handleTextChange(idx: number, value: string) {
    setTexts((prev) => prev.map((t, i) => (i === idx ? value : t)))
    const parsed = parsePoint(value)
    if (parsed) setWaypoints((prev) => prev.map((w, i) => (i === idx ? parsed : w)))
  }

  function handleAddWaypoint() {
    setWaypoints((prev) => [...prev, null])
    setTexts((prev) => [...prev, ''])
  }

  function handleRemoveWaypoint(idx: number) {
    setWaypoints((prev) => prev.filter((_, i) => i !== idx))
    setTexts((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleStart() {
    if (!deviceId || validWaypoints.length < 2) return
    setStatus({ kind: 'busy' })
    try {
      const result = await startRouteLoop(
        deviceId,
        navMode,
        validWaypoints,
        { enabled: pauseEnabled, min: pauseMin, max: pauseMax },
        speedKmh
      )
      setRoutePath(result.route)
      pushHistory({ lat: validWaypoints[0].lat, lng: validWaypoints[0].lng, kind: 'route_loop' }).catch(() => {})
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('routeloop.status.failed_start') })
    }
  }

  async function handleStop() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      await stopRouteLoop(deviceId)
      setRoutePath([])
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('routeloop.status.failed_stop') })
    }
  }

  async function handlePauseResume() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      if (isPaused) {
        await resumeRouteLoop(deviceId)
      } else {
        await pauseRouteLoop(deviceId)
      }
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('routeloop.status.failed_update') })
    }
  }

  return (
    <div className="panel">
      <h2>{t('routeloop.title')}</h2>
      <p className="panel-description">{t('routeloop.description')}</p>

      <div className="panel-scroll-body">
      {!deviceId && <p className="panel-hint">{t('panel.hint.select_device')}</p>}
      {deviceId && !deviceReady && (
        <p className="panel-hint warning">{device?.detail ?? t('panel.hint.device_not_ready')}</p>
      )}
      {deviceState === 'teleporting' && (
        <p className="panel-hint warning">{t('panel.hint.teleporting')}</p>
      )}

      <div className="waypoint-list">
        {waypoints.map((_, idx) => (
          <div className="coord-row" key={idx}>
            <span>{idx + 1}</span>
            <input
              type="text"
              placeholder="lat,lng"
              value={texts[idx] ?? ''}
              onFocus={() => requestPoint((lat, lng) => updateWaypoint(idx, { lat, lng }))}
              onChange={(e) => handleTextChange(idx, e.target.value)}
            />
            <button className="waypoint-remove" onClick={() => handleRemoveWaypoint(idx)} title={t('panel.remove_waypoint')}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <button className="swap-button" onClick={handleAddWaypoint}>
        {t('panel.add_waypoint')}
      </button>

      <label className="pause-toggle">
        <input
          type="checkbox"
          checked={pauseEnabled}
          onChange={(e) => setPauseEnabled(e.target.checked)}
          disabled={isActive}
        />
        {t('panel.pause_toggle')}
      </label>
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
      {isRunning && (
        <p className="panel-status ok">
          {t('routeloop.status.looping')}{liveEtaSeconds !== null ? `… ETA ${formatEta(liveEtaSeconds)}` : '…'}
        </p>
      )}
      {isPaused && <p className="panel-status warning">{t('panel.paused')}</p>}
      {status.kind === 'error' && <p className="panel-status error">{status.message}</p>}
    </div>
  )
}
