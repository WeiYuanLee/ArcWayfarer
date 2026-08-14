import type { ReactNode } from 'react'
import { Group, NumberInput, type NumberInputProps } from '@mantine/core'

export type NumberRangeFieldProps = {
  min: number | ''
  max: number | ''
  onMinChange: (value: number | '') => void
  onMaxChange: (value: number | '') => void
  minLabel?: ReactNode
  maxLabel?: ReactNode
  minProps?: Omit<NumberInputProps, 'value' | 'onChange' | 'label'>
  maxProps?: Omit<NumberInputProps, 'value' | 'onChange' | 'label'>
}

/** A responsive pair of numeric inputs for pause, dwell, or distance ranges. */
export function NumberRangeField({
  min, max, onMinChange, onMaxChange, minLabel, maxLabel, minProps, maxProps,
}: NumberRangeFieldProps) {
  return (
    <Group grow align="end" wrap="nowrap">
      <NumberInput
        label={minLabel}
        value={min}
        onChange={(value) => onMinChange(typeof value === 'number' ? value : '')}
        {...minProps}
      />
      <NumberInput
        label={maxLabel}
        value={max}
        onChange={(value) => onMaxChange(typeof value === 'number' ? value : '')}
        {...maxProps}
      />
    </Group>
  )
}
