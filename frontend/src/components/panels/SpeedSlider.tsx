import { useEffect, useState } from 'react'
import { getNavModeSpeeds, type NavMode } from '../../services/api'
import { useT } from '../../i18n'
import type { StringKey } from '../../i18n'

const MIN_KMH = 1
const MAX_KMH = 40

const MODE_ORDER: NavMode[] = ['walk', 'bike', 'drive']
const MODE_ICON: Record<NavMode, string> = { walk: '🚶', bike: '🚴', drive: '🚗' }
const MODE_LABEL_KEYS: Record<NavMode, StringKey> = {
  walk: 'navmode.walk',
  bike: 'navmode.bike',
  drive: 'navmode.drive',
}

function clamp(kmh: number): number {
  return Math.min(Math.max(kmh, MIN_KMH), MAX_KMH)
}

const EDGE_INSET_PERCENT = 9

function percentFor(kmh: number): number {
  const raw = ((clamp(kmh) - MIN_KMH) / (MAX_KMH - MIN_KMH)) * 100
  return EDGE_INSET_PERCENT + (raw / 100) * (100 - EDGE_INSET_PERCENT * 2)
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

  function handlePreset(mode: NavMode, kmh: number) {
    onNavModeChange(mode)
    onChange(clamp(kmh))
  }

  return (
    <div className="speed-slider">
      <div className="speed-slider-markers">
        {modeSpeeds &&
          MODE_ORDER.map((mode) => {
            const kmh = modeSpeeds[mode] * 3.6
            return (
              <button
                key={mode}
                type="button"
                className={`speed-marker${navMode === mode ? ' active' : ''}`}
                style={{ left: `${percentFor(kmh)}%` }}
                onClick={() => handlePreset(mode, kmh)}
                disabled={disabled}
                title={`${t(MODE_LABEL_KEYS[mode])} (${kmh.toFixed(1)} km/h)`}
              >
                {MODE_ICON[mode]}
              </button>
            )
          })}
      </div>
      <input
        type="range"
        className="speed-slider-track"
        min={MIN_KMH}
        max={MAX_KMH}
        step={0.5}
        value={valueKmh}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="speed-slider-value">{valueKmh.toFixed(1)} km/h</div>
    </div>
  )
}
