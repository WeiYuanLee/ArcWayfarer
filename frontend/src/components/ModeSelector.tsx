import { useT } from '../i18n'
import type { StringKey } from '../i18n'
import { SegmentedControl } from '@mantine/core'

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
    <SegmentedControl
      aria-label="Location control mode"
      value={value}
      onChange={(next) => onChange(next as Mode)}
      data={MODES.map((mode) => ({ value: mode.id, label: t(mode.labelKey) }))}
    />
  )
}
