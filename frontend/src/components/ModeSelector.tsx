import { useT } from '../i18n'
import type { ReactNode } from 'react'
import type { StringKey } from '../i18n'
import { SegmentedControl } from '@mantine/core'
import { IconDeviceGamepad2, IconDice5, IconLocation, IconRepeat, IconRoute, IconRoute2 } from '@tabler/icons-react'

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
  const icons: Record<Mode, ReactNode> = {
    teleport: <IconLocation size={16} stroke={1.8} />,
    navigate: <IconRoute size={16} stroke={1.8} />,
    'route-loop': <IconRepeat size={16} stroke={1.8} />,
    'multi-stop': <IconRoute2 size={16} stroke={1.8} />,
    'random-walk': <IconDice5 size={16} stroke={1.8} />,
    joystick: <IconDeviceGamepad2 size={16} stroke={1.8} />,
  }
  return (
    <div className="mode-switcher">
      <SegmentedControl
        aria-label="Location control mode"
        value={value}
        onChange={(next) => onChange(next as Mode)}
        data={MODES.map((mode) => ({ value: mode.id, label: <span className="mode-switcher-item">{icons[mode.id]}<span>{t(mode.labelKey)}</span></span> }))}
      />
    </div>
  )
}
