import { useT } from '../i18n'
import type { StringKey } from '../i18n'

export type Mode = 'teleport' | 'navigate' | 'route-loop' | 'multi-stop' | 'random-walk' | 'joystick'

const MODES: { id: Mode; labelKey: StringKey }[] = [
  { id: 'teleport', labelKey: 'mode.teleport' },
  { id: 'navigate', labelKey: 'mode.navigate' },
  { id: 'route-loop', labelKey: 'mode.route_loop' },
  { id: 'multi-stop', labelKey: 'mode.multi_stop' },
  { id: 'random-walk', labelKey: 'mode.random_walk' },
  { id: 'joystick', labelKey: 'mode.joystick' },
]

type Props = {
  value: Mode
  onChange: (mode: Mode) => void
}

export function ModeSelector({ value, onChange }: Props) {
  const t = useT()
  return (
    <div className="dynamic-capsule-selector">
      {MODES.map((mode) => {
        const isActive = mode.id === value
        return (
          <button
            key={mode.id}
            className={`capsule-item ${isActive ? 'active' : ''}`}
            onClick={() => onChange(mode.id)}
          >
            <span className="capsule-label">{t(mode.labelKey)}</span>
            {isActive && <div className="capsule-glow-indicator" />}
          </button>
        )
      })}
    </div>
  )
}
