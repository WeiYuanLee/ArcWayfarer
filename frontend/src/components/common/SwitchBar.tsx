import type { ReactNode } from 'react'
import { Group, Stack, Switch, Text } from '@mantine/core'

type SwitchBarProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  subLabel?: string
  children?: ReactNode
}

export function SwitchBar({ checked, onChange, label, disabled, subLabel, children }: SwitchBarProps) {
  return (
    <Stack className={`switch-bar-row${disabled ? ' disabled' : ''}`} gap="xs">
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Text size="sm" fw={500}>{label}</Text>
          {subLabel && <Text size="xs" c="dimmed">{subLabel}</Text>}
        </div>
        <Switch checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} disabled={disabled} aria-label={label} />
      </Group>
      {children}
    </Stack>
  )
}
