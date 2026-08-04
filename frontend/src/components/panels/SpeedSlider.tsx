import { useEffect, useState } from 'react'
import { getNavModeSpeeds, type NavMode } from '../../services/api'
import { useT } from '../../i18n'
import type { StringKey } from '../../i18n'

const MIN_KMH = 1
const MAX_KMH = 40

const MODE_ORDER: NavMode[] = ['walk', 'bike', 'drive']
const MODE_LABEL_KEYS: Record<NavMode, StringKey> = {
  walk: 'navmode.walk',
  bike: 'navmode.bike',
  drive: 'navmode.drive',
}

function clamp(kmh: number): number {
  return Math.min(Math.max(kmh, MIN_KMH), MAX_KMH)
}

function getSpeedZoneInfo(kmh: number) {
  if (kmh <= 8) return { label: 'Walk', color: '#00e676' }
  if (kmh <= 20) return { label: 'Cycle', color: '#00f2fe' }
  return { label: 'Drive', color: '#ff5e36' }
}

type Props = {
  valueKmh: number
  navMode: NavMode
  onChange: (kmh: number) => void
  onNavModeChange: (mode: NavMode) => void
  disabled?: boolean
}

export function SpeedSlider({ valueKmh, navMode, onChange, onNavModeChange, disabled }: Props) {
  const t = useT()
  const [modeSpeeds, setModeSpeeds] = useState<Record<NavMode, number> | null>(null)

  useEffect(() => {
    getNavModeSpeeds()
      .then(setModeSpeeds)
      .catch(() => setModeSpeeds(null))
  }, [])

  function handleModeSelect(mode: NavMode) {
    onNavModeChange(mode)
    if (modeSpeeds && modeSpeeds[mode]) {
      const speed = clamp(modeSpeeds[mode] * 3.6)
      onChange(speed)
    }
  }

  const fillPercent = ((clamp(valueKmh) - MIN_KMH) / (MAX_KMH - MIN_KMH)) * 100
  const speedZone = getSpeedZoneInfo(valueKmh)

  return (
    <div className="speed-slider-wrapper">
      {/* 1. Segmented Transport Mode Bar */}
      <div className="transport-mode-segmented">
        {MODE_ORDER.map((mode) => {
          const isActive = navMode === mode
          const defaultKmh = modeSpeeds ? (modeSpeeds[mode] * 3.6).toFixed(0) : ''
          return (
            <button
              key={mode}
              type="button"
              className={`transport-tab ${isActive ? 'active' : ''}`}
              onClick={() => handleModeSelect(mode)}
              disabled={disabled}
            >
              <span className="transport-name">{t(MODE_LABEL_KEYS[mode])}</span>
              {defaultKmh && <span className="transport-speed-tag">{defaultKmh}km/h</span>}
            </button>
          )
        })}
      </div>

      {/* 2. Speed Telemetry Header */}
      <div className="speed-telemetry-header">
        <div className="speed-zone-badge" style={{ color: speedZone.color, borderColor: `${speedZone.color}44` }}>
          <span className="speed-zone-dot" style={{ background: speedZone.color }} />
          <span>{speedZone.label}</span>
        </div>
        <div className="speed-val-display">
          <span className="speed-number" style={{ color: speedZone.color }}>
            {valueKmh.toFixed(1)}
          </span>
          <span className="speed-unit">km/h</span>
        </div>
      </div>

      {/* 3. Gradient Range Slider */}
      <div className="slider-track-container">
        <input
          type="text"
          readOnly
          style={{ display: 'none' }}
        />
        <input
          type="range"
          className="cyber-range-slider"
          min={MIN_KMH}
          max={MAX_KMH}
          step={0.5}
          value={valueKmh}
          disabled={disabled}
          style={{
            background: `linear-gradient(to right, ${speedZone.color} 0%, ${speedZone.color} ${fillPercent}%, rgba(255,255,255,0.12) ${fillPercent}%, rgba(255,255,255,0.12) 100%)`,
          }}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </div>
  )
}
