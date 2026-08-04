import { useEffect, useState } from 'react'
import { parseGpx } from './gpx'
import {
  pauseMultiStop,
  pushHistory,
  resumeMultiStop,
  startMultiStop,
  stopMultiStop,
  type NavMode,
} from '../../services/api'
import type { LatLng, PanelProps } from './types'
import { EMPTY_OVERLAY } from './types'
import { formatPoint, parsePastedPoints, parsePoint } from './coords'
import { SpeedSlider } from './SpeedSlider'
import { PlaybackControls } from './PlaybackControls'
import { ActiveFlightHUD } from './ActiveFlightHUD'
import { SwitchBar } from '../common/SwitchBar'
import { ModeInfoTooltip } from '../common/ModeInfoTooltip'
import { useT } from '../../i18n'

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string }
type ImportMessage = { kind: 'ok' | 'error'; text: string }

const WAYPOINT_COLOR = '#4a9af0'

export function MultiStopPanel({
  deviceId,
  device,
  deviceState,
  livePosition,
  liveEtaSeconds,
  liveStopIndex,
  requestPoint,
  requestFlyTo,
  setOverlay,
}: PanelProps) {
  const t = useT()
  const [waypoints, setWaypoints] = useState<(LatLng | null)[]>([null, null])
  const [texts, setTexts] = useState<string[]>(['', ''])
  const [navMode, setNavMode] = useState<NavMode>('walk')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [routePath, setRoutePath] = useState<LatLng[]>([])
  const [pauseEnabled, setPauseEnabled] = useState(false)
  const [pauseMin, setPauseMin] = useState(5)
  const [pauseMax, setPauseMax] = useState(20)
  const [straightLine, setStraightLine] = useState(true)
  const [speedKmh, setSpeedKmh] = useState(5)
  const [jumpMode, setJumpMode] = useState(false)
  const [jumpPreDelay, setJumpPreDelay] = useState(0)
  const [jumpPostDelay, setJumpPostDelay] = useState(2)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [importMessage, setImportMessage] = useState<ImportMessage | null>(null)
  const [gpxFileName, setGpxFileName] = useState<string | null>(null)

  const deviceReady = device?.status === 'ready'
  const isRunning = deviceState === 'navigating'
  const isPaused = deviceState === 'paused'
  const isActive = isRunning || isPaused
  const isBusy = status.kind === 'busy'
  const validWaypoints = waypoints.filter((w): w is LatLng => w !== null)
  const canStart = deviceReady && !isActive && validWaypoints.length >= 2 && !isBusy

  // Auto fill waypoint 1 with live position if empty
  useEffect(() => {
    if (!waypoints[0] && livePosition && !texts[0]) {
      updateWaypoint(0, livePosition)
    }
  }, [livePosition])

  // Automatically update route path preview when not active
  useEffect(() => {
    if (!isActive) {
      if (validWaypoints.length >= 2) {
        setRoutePath(validWaypoints)
      } else {
        setRoutePath([])
      }
    }
  }, [waypoints, isActive])

  const isLocked = isActive || isBusy

  useEffect(() => {
    setOverlay({
      markers: waypoints
        .map((wp, idx) =>
          wp
            ? {
                id: `multistop-${idx}`,
                lat: wp.lat,
                lng: wp.lng,
                color: WAYPOINT_COLOR,
                label: String(idx + 1),
                draggable: !isLocked,
                onDragEnd: (lat: number, lng: number) => {
                  if (isLocked) return
                  updateWaypoint(idx, { lat, lng })
                },
              }
            : null
        )
        .filter((m): m is NonNullable<typeof m> => m !== null),
      path: routePath,
    })
    return () => setOverlay(EMPTY_OVERLAY)
  }, [waypoints, routePath, isLocked, setOverlay])

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

  function handleMoveWaypoint(idx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= waypoints.length) return
    setWaypoints((prev) => {
      const next = [...prev]
      const temp = next[idx]
      next[idx] = next[targetIdx]
      next[targetIdx] = temp
      return next
    })
    setTexts((prev) => {
      const next = [...prev]
      const temp = next[idx]
      next[idx] = next[targetIdx]
      next[targetIdx] = temp
      return next
    })
  }

  function handleClearAllWaypoints() {
    setWaypoints([null, null])
    setTexts(['', ''])
    setGpxFileName(null)
    setImportMessage(null)
  }

  async function handleGpxFile(file: File) {
    setImportMessage(null)
    try {
      const text = await file.text()
      const points = parseGpx(text)
      if (points.length === 0) {
        setImportMessage({ kind: 'error', text: t('multistop.gpx_no_points') })
        return
      }
      setWaypoints(points)
      setTexts(points.map(formatPoint))
      setGpxFileName(file.name)
      requestFlyTo(points[0].lat, points[0].lng)
    } catch {
      setImportMessage({ kind: 'error', text: t('multistop.gpx_import_failed') })
    }
  }

  function handlePasteSubmit() {
    const { points, invalidCount } = parsePastedPoints(pasteText)
    if (points.length === 0) {
      setImportMessage({ kind: 'error', text: t('multistop.paste_empty') })
      return
    }
    setWaypoints(points)
    setTexts(points.map(formatPoint))
    requestFlyTo(points[0].lat, points[0].lng)
    setImportMessage(invalidCount > 0 ? { kind: 'ok', text: t('multistop.import_partial') } : null)
    setPasteOpen(false)
    setPasteText('')
  }

  async function handleStart() {
    if (!deviceId || validWaypoints.length < 2) return
    setStatus({ kind: 'busy' })
    try {
      const result = await startMultiStop(
        deviceId,
        navMode,
        validWaypoints,
        { enabled: pauseEnabled, min: pauseMin, max: pauseMax },
        { straightLine, jumpMode, jumpPreDelay, jumpPostDelay, customSpeedKmh: speedKmh }
      )
      setRoutePath(result.route)
      pushHistory({ lat: validWaypoints[0].lat, lng: validWaypoints[0].lng, kind: 'multi_stop' }).catch(() => {})
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('multistop.status.failed_start') })
    }
  }

  async function handleStop() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      await stopMultiStop(deviceId)
      setRoutePath([])
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('multistop.status.failed_stop') })
    }
  }

  async function handlePauseResume() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      if (isPaused) {
        await resumeMultiStop(deviceId)
      } else {
        await pauseMultiStop(deviceId)
      }
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('multistop.status.failed_update') })
    }
  }

  return (
    <div className="panel">
      <div className="panel-header-row">
        <h2>{t('multistop.title')}</h2>
        <ModeInfoTooltip description={t('multistop.description')} />
      </div>

      {isActive ? (
        <ActiveFlightHUD
          modeName={t('multistop.title')}
          isRunning={isRunning}
          isPaused={isPaused}
          isBusy={isBusy}
          currentIndex={liveStopIndex ?? 1}
          totalPoints={validWaypoints.length || 2}
          liveEtaSeconds={liveEtaSeconds}
          livePosition={livePosition}
          routePath={routePath}
          waypoints={waypoints}
          isLoop={false}
          onPauseResume={handlePauseResume}
          onStop={handleStop}
        />
      ) : (
        <div className="panel-scroll-body">
          {!deviceId && <p className="panel-hint">{t('panel.hint.select_device')}</p>}
          {deviceId && !deviceReady && (
            <p className="panel-hint warning">{device?.detail ?? t('panel.hint.device_not_ready')}</p>
          )}
          {deviceState === 'teleporting' && (
            <p className="panel-hint warning">{t('panel.hint.teleporting')}</p>
          )}

          {gpxFileName && (
            <div className="route-preflight-badge">
              <span>GPX: {gpxFileName}</span>
              <span>·</span>
              <span>{validWaypoints.length} Points</span>
            </div>
          )}

          <div className="waypoint-list">
            {waypoints.map((_, idx) => (
              <div className="coord-row" key={idx}>
                <span>{idx + 1}</span>
                <input
                  type="text"
                  placeholder="lat, lng or URL"
                  value={texts[idx] ?? ''}
                  onFocus={() => requestPoint((lat, lng) => updateWaypoint(idx, { lat, lng }))}
                  onChange={(e) => handleTextChange(idx, e.target.value)}
                />
                <div className="waypoint-row-actions">
                  <button disabled={idx === 0} onClick={() => handleMoveWaypoint(idx, 'up')} title="Move Up">↑</button>
                  <button disabled={idx === waypoints.length - 1} onClick={() => handleMoveWaypoint(idx, 'down')} title="Move Down">↓</button>
                  <button className="waypoint-remove" onClick={() => handleRemoveWaypoint(idx)} title={t('panel.remove_waypoint')}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="panel-quick-actions">
            <button className="swap-button" onClick={handleAddWaypoint}>
              {t('panel.add_waypoint')}
            </button>
            <button className="swap-button" onClick={handleClearAllWaypoints}>
              {t('multistop.action.clear_all')}
            </button>
          </div>

          <div className="import-actions">
            <label className="swap-button">
              {t('multistop.import_gpx')}
              <input
                type="file"
                accept=".gpx,application/gpx+xml"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) await handleGpxFile(file)
                  e.target.value = ''
                }}
              />
            </label>
            <button className="swap-button" onClick={() => setPasteOpen((open) => !open)}>
              {t('multistop.paste_coords')}
            </button>
          </div>

          {pasteOpen && (
            <>
              <textarea
                className="paste-textarea"
                placeholder={t('multistop.paste_placeholder')}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div className="import-actions">
                <button className="swap-button" onClick={handlePasteSubmit}>
                  {t('multistop.paste_submit')}
                </button>
                <button className="swap-button" onClick={() => setPasteOpen(false)}>
                  {t('multistop.paste_cancel')}
                </button>
              </div>
            </>
          )}

          {importMessage && (
            <p className={`panel-status ${importMessage.kind === 'error' ? 'error' : 'ok'}`}>{importMessage.text}</p>
          )}

          <SwitchBar
            label={t('multistop.jump_mode')}
            checked={jumpMode}
            onChange={setJumpMode}
            disabled={isActive}
          />

          {jumpMode ? (
            <>
              <div className="coord-row">
                <span>{t('multistop.jump_pre_delay')}</span>
                <input
                  type="number"
                  min={0}
                  value={jumpPreDelay}
                  disabled={isActive}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setJumpPreDelay(Number(e.target.value))}
                />
              </div>
              <div className="coord-row">
                <span>{t('multistop.jump_post_delay')}</span>
                <input
                  type="number"
                  min={0}
                  value={jumpPostDelay}
                  disabled={isActive}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setJumpPostDelay(Number(e.target.value))}
                />
              </div>
            </>
          ) : (
            <>
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
            </>
          )}

          <PlaybackControls
            canStart={canStart}
            isActive={isActive}
            isPaused={isPaused}
            isBusy={isBusy}
            onStart={handleStart}
            onPauseResume={handlePauseResume}
            onStop={handleStop}
          />
        </div>
      )}

      {status.kind === 'busy' && <p className="panel-status">{t('generic.working')}</p>}
      {status.kind === 'error' && <p className="panel-status error">{status.message}</p>}
    </div>
  )
}
