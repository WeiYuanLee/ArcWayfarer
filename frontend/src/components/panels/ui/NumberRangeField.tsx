import type { ReactNode } from 'react'
import { Group } from '@mantine/core'
import { ValidatedNumberInput, type ValidatedNumberInputProps } from './ValidatedNumberInput'

export type NumberRangeFieldProps = {
  min: number
  max: number
  onMinChange: (value: number) => void
  onMaxChange: (value: number) => void
  onMinValidityChange?: (valid: boolean) => void
  onMaxValidityChange?: (valid: boolean) => void
  minLabel?: ReactNode
  maxLabel?: ReactNode
  minProps?: Omit<ValidatedNumberInputProps, 'value' | 'onChange' | 'label'>
  maxProps?: Omit<ValidatedNumberInputProps, 'value' | 'onChange' | 'label'>
}

/** A responsive pair of numeric inputs for pause, dwell, or distance ranges. */
export function NumberRangeField({
  min, max, onMinChange, onMaxChange, onMinValidityChange, onMaxValidityChange, minLabel, maxLabel, minProps, maxProps,
}: NumberRangeFieldProps) {
  return (
    <Group grow align="end" wrap="nowrap">
      <ValidatedNumberInput
        label={minLabel}
        value={min}
        onChange={onMinChange}
        onValidityChange={onMinValidityChange}
        {...minProps}
      />
      <ValidatedNumberInput
        label={maxLabel}
        value={max}
        onChange={onMaxChange}
        onValidityChange={onMaxValidityChange}
        {...maxProps}
      />
    </Group>
  )
}
