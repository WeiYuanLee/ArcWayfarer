type SwitchBarProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  subLabel?: string
}

export function SwitchBar({ checked, onChange, label, disabled, subLabel }: SwitchBarProps) {
  return (
    <Group className={`switch-bar-row${disabled ? ' disabled' : ''}`} justify="space-between" wrap="nowrap">
      <div>
        <Text size="sm" fw={500}>{label}</Text>
        {subLabel && <Text size="xs" c="dimmed">{subLabel}</Text>}
      </div>
      <Switch checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} disabled={disabled} aria-label={label} />
    </Group>
  )
}
import { Group, Switch, Text } from '@mantine/core'
