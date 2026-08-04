import { memo, useState } from 'react'
import { useT } from '../../i18n'
import type { DeviceState } from '../panels/types'

type LatLng = { lat: number; lng: number }

type Props = {
  deviceState?: DeviceState
  livePosition: LatLng | null
  liveSpeedMps: number | null
  lat: number | null
  lng: number | null
}

export const StatusBar = memo(function StatusBar({ deviceState = 'idle', livePosition, liveSpeedMps, lat, lng }: Props) {
  const t = useT()
  const [copied, setCopied] = useState(false)

  const shownLat = livePosition ? livePosition.lat : lat
  const shownLng = livePosition ? livePosition.lng : lng
  const isRunning = deviceState === 'navigating' || deviceState === 'looping' || deviceState === 'random_walk' || deviceState === 'joystick'
  const isPaused = deviceState === 'paused'
  const speedKmh = liveSpeedMps !== null ? liveSpeedMps * 3.6 : null

  function handleCopyCoords() {
    if (shownLat === null || shownLng === null) return
    const text = `${shownLat.toFixed(6)}, ${shownLng.toFixed(6)}`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Calculate arc percentage for SVG Speedometer gauge (max 100 km/h)
  const maxSpeed = 100
  const speedVal = speedKmh ?? 0
  const percent = Math.min(1.0, Math.max(0, speedVal / maxSpeed))
  const dashoffset = 126 - 126 * percent

  return (
    <div className="cyber-hud-statusbar">
      {/* Live Signal Pulse */}
      <div className="hud-signal-section">
        <span className={`hud-pulse-dot ${isRunning ? 'active-pulse' : isPaused ? 'paused' : 'idle'}`} />
        <span className="hud-status-text">
          {isRunning ? t('navigate.status.running') : isPaused ? t('panel.paused') : 'STANDBY'}
        </span>
      </div>

      {/* Lat / Lng Display */}
      <div className="hud-coords-section" onClick={handleCopyCoords} title={t('statusbar.copied')}>
        <span className="hud-label">{t('statusbar.lat')}:</span>
        <span className="hud-val">{shownLat !== null ? shownLat.toFixed(5) : '--'}</span>
        <span className="hud-label">{t('statusbar.lng')}:</span>
        <span className="hud-val">{shownLng !== null ? shownLng.toFixed(5) : '--'}</span>
        <button className="hud-copy-btn">{copied ? '✓' : '📋'}</button>
      </div>

      {/* Speedometer Gauge HUD */}
      {(isRunning || (speedKmh !== null && speedKmh > 0)) && (
        <div className="hud-speedometer-section">
          <svg className="speed-gauge-svg" viewBox="0 0 50 50">
            <circle className="speed-gauge-bg" cx="25" cy="25" r="20" />
            <circle
              className="speed-gauge-fill"
              cx="25"
              cy="25"
              r="20"
              style={{ strokeDasharray: 126, strokeDashoffset: dashoffset }}
            />
          </svg>
          <div className="hud-speed-text">
            <span className="speed-val">{speedKmh !== null ? speedKmh.toFixed(1) : '0.0'}</span>
            <span className="speed-unit">KM/H</span>
          </div>
        </div>
      )}
    </div>
  )
})
