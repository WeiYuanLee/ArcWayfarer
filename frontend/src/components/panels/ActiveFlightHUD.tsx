import { useT } from '../../i18n'
import { calculateRouteProgressPct, formatEta } from './coords'
import type { LatLng } from './types'

type Props = {
  modeName: string
  isRunning: boolean
  isPaused: boolean
  isBusy: boolean
  currentIndex: number | null
  totalPoints: number
  liveEtaSeconds: number | null
  livePosition?: LatLng | null
  routePath?: LatLng[]
  waypoints?: (LatLng | null)[]
  isLoop?: boolean
  onPauseResume: () => void
  onStop: () => void
}

export function ActiveFlightHUD({
  modeName,
  isRunning,
  isPaused,
  isBusy,
  currentIndex,
  totalPoints,
  liveEtaSeconds,
  livePosition,
  routePath,
  waypoints,
  isLoop = false,
  onPauseResume,
  onStop,
}: Props) {
  const t = useT()
  const current = Math.max(1, Math.min(currentIndex || 1, totalPoints))
  const next = current < totalPoints ? current + 1 : (isLoop ? 1 : current)
  const pct = calculateRouteProgressPct(routePath, waypoints, livePosition, currentIndex, totalPoints, isLoop)


  return (
    <div className="active-flight-hud">
      <div className="hud-status-badge">
        <span className={`hud-dot ${isPaused ? 'paused' : 'running'}`} />
        <span className="hud-mode-title">{modeName}</span>
        <span className="hud-state-label">({isPaused ? t('panel.paused') : t('generic.working')})</span>
      </div>

      <div className="hud-card">
        <div className="hud-leg-info">
          <span className="hud-leg-title">{t('hud.current_leg')}</span>
          <span className="hud-leg-nodes">
            Point #{current} → Point #{next}
          </span>
        </div>

        <div className="hud-progress-bar-bg">
          <div className="hud-progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>

        <div className="hud-telemetry-row">
          <span>{t('multistop.stop_progress')} {current} / {totalPoints} ({pct}%)</span>
          {liveEtaSeconds !== null && <span>ETA {formatEta(liveEtaSeconds)}</span>}
        </div>
      </div>

      <div className="playback-controls-row">
        <button
          className="playback-btn-primary"
          disabled={isBusy}
          onClick={onPauseResume}
        >
          <span className="playback-btn-icon">{isRunning ? '⏸' : '▶'}</span>
          {t(isRunning ? 'playback.pause' : 'playback.resume')}
        </button>
        <button
          className="playback-btn-stop"
          disabled={isBusy}
          onClick={onStop}
          title={t('playback.stop')}
        >
          ⏹
        </button>
      </div>
    </div>
  )
}
