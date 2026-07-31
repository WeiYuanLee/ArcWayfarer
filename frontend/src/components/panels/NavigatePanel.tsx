import { useEffect, useState } from 'react'
import { pauseNavigate, pushHistory, resumeNavigate, startNavigate, stopNavigate, type NavMode } from '../../services/api'
import type { LatLng, PanelProps } from './types'
import { EMPTY_OVERLAY } from './types'
import { formatEta, formatPoint, parsePoint } from './coords'
import { SpeedSlider } from './SpeedSlider'
import { PlaybackControls } from './PlaybackControls'
import { FavoriteButton } from './FavoriteButton'
import { useT } from '../../i18n'

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string }

export function NavigatePanel({ deviceId, device, deviceState, liveEtaSeconds, requestPoint, setOverlay }: PanelProps) {
  const t = useT()
  const [start, setStart] = useState<LatLng | null>(null)
  const [end, setEnd] = useState<LatLng | null>(null)
  const [startText, setStartText] = useState('')
  const [endText, setEndText] = useState('')
  const [navMode, setNavMode] = useState<NavMode>('walk')
  const [speedKmh, setSpeedKmh] = useState(5)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [routePath, setRoutePath] = useState<LatLng[]>([])

  const deviceReady = device?.status === 'ready'
  const isRunning = deviceState === 'navigating'
  const isPaused = deviceState === 'paused'
  const isActive = isRunning || isPaused
  const isBusy = status.kind === 'busy'
  const canStart = deviceReady && !isActive && start !== null && end !== null && !isBusy

  useEffect(() => {
    setOverlay({
      markers: [
        ...(start ? [{ id: 'nav-start', lat: start.lat, lng: start.lng, color: '#4caf50', label: 'S' }] : []),
        ...(end ? [{ id: 'nav-end', lat: end.lat, lng: end.lng, color: '#e05555', label: 'E' }] : []),
      ],
      path: routePath,
    })
    return () => setOverlay(EMPTY_OVERLAY)
  }, [start, end, routePath, setOverlay])

  async function handleStart() {
    if (!deviceId || !start || !end) return
    setStatus({ kind: 'busy' })
    try {
      const result = await startNavigate(deviceId, navMode, start, end, speedKmh)
      setRoutePath(result.route)
      pushHistory({ lat: start.lat, lng: start.lng, kind: 'navigate' }).catch(() => {})
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('navigate.status.failed_start') })
    }
  }

  async function handleStop() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      await stopNavigate(deviceId)
      setRoutePath([])
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('navigate.status.failed_stop') })
    }
  }

  async function handlePauseResume() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      if (isPaused) {
        await resumeNavigate(deviceId)
      } else {
        await pauseNavigate(deviceId)
      }
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('navigate.status.failed_update') })
    }
  }

  function handleStartTextChange(value: string) {
    setStartText(value)
    const parsed = parsePoint(value)
    if (parsed) setStart(parsed)
  }

  function handleEndTextChange(value: string) {
    setEndText(value)
    const parsed = parsePoint(value)
    if (parsed) setEnd(parsed)
  }

  function handleSwap() {
    const s = start
    setStart(end)
    setEnd(s)
    setStartText(formatPoint(end))
    setEndText(formatPoint(s))
  }

  return (
    <div className="panel">
      <h2>{t('navigate.title')}</h2>
      <p className="panel-description">{t('navigate.description')}</p>

      <div className="panel-scroll-body">
      {!deviceId && <p className="panel-hint">{t('panel.hint.select_device')}</p>}
      {deviceId && !deviceReady && (
        <p className="panel-hint warning">{device?.detail ?? t('panel.hint.device_not_ready')}</p>
      )}
      {deviceState === 'teleporting' && (
        <p className="panel-hint warning">{t('panel.hint.teleporting')}</p>
      )}

      <div className="coord-row">
        <span>S</span>
        <input
          type="text"
          placeholder="lat,lng"
          value={startText}
          onFocus={() =>
            requestPoint((lat, lng) => {
              setStart({ lat, lng })
              setStartText(formatPoint({ lat, lng }))
            })
          }
          onChange={(e) => handleStartTextChange(e.target.value)}
        />
        <FavoriteButton point={start} />
      </div>
      <button className="swap-button" onClick={handleSwap} title={t('navigate.swap')}>
        {t('navigate.swap')}
      </button>
      <div className="coord-row">
        <span>E</span>
        <input
          type="text"
          placeholder="lat,lng"
          value={endText}
          onFocus={() =>
            requestPoint((lat, lng) => {
              setEnd({ lat, lng })
              setEndText(formatPoint({ lat, lng }))
            })
          }
          onChange={(e) => handleEndTextChange(e.target.value)}
        />
        <FavoriteButton point={end} />
      </div>

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
          {t('navigate.status.running')}{liveEtaSeconds !== null ? `… ETA ${formatEta(liveEtaSeconds)}` : '…'}
        </p>
      )}
      {isPaused && <p className="panel-status warning">{t('panel.paused')}</p>}
      {status.kind === 'error' && <p className="panel-status error">{status.message}</p>}
    </div>
  )
}
