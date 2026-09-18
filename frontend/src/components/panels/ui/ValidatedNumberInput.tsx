import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { TextInput, UnstyledButton, type TextInputProps } from '@mantine/core'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { useT } from '../../../i18n'

export type ValidatedNumberInputProps = Omit<TextInputProps, 'defaultValue' | 'onChange' | 'rightSection' | 'type' | 'value'> & {
  value: number
  onChange: (value: number) => void
  onValidityChange?: (valid: boolean) => void
  min?: number
  max?: number
  step?: number
}

function parseAsciiNumber(value: string): number | null {
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function decimalPlaces(value: number): number {
  const [, decimals = ''] = String(value).split('.')
  return decimals.length
}

/**
 * Numeric field that keeps the user's raw text visible while validating it.
 * Mantine NumberInput filters invalid IME/full-width input before the app can
 * explain the problem, so this uses a text input with shared spin controls.
 */
export function ValidatedNumberInput({
  value,
  onChange,
  onValidityChange,
  min,
  max,
  step = 1,
  error,
  disabled,
  onKeyDown,
  ...props
}: ValidatedNumberInputProps) {
  const t = useT()
  const [draft, setDraft] = useState(() => String(value))
  const lastEmittedValue = useRef<number | null>(null)
  const validityCallback = useRef(onValidityChange)
  validityCallback.current = onValidityChange

  const parsed = parseAsciiNumber(draft)
  const inRange = parsed !== null && (min === undefined || parsed >= min) && (max === undefined || parsed <= max)
  const validationError = parsed === null
    ? t('generic.number_invalid')
    : !inRange
      ? t('generic.number_out_of_range')
      : undefined

  useEffect(() => {
    if (lastEmittedValue.current === value) {
      lastEmittedValue.current = null
      return
    }
    lastEmittedValue.current = null
    setDraft(String(value))
    validityCallback.current?.(true)
  }, [value])

  useEffect(() => () => validityCallback.current?.(true), [])

  function updateDraft(raw: string) {
    setDraft(raw)
    const next = parseAsciiNumber(raw)
    const valid = next !== null && (min === undefined || next >= min) && (max === undefined || next <= max)
    validityCallback.current?.(valid)
    if (valid && next !== null) {
      lastEmittedValue.current = next
      onChange(next)
    }
  }

  function adjust(direction: -1 | 1) {
    const base = inRange && parsed !== null ? parsed : value
    const precision = Math.max(decimalPlaces(step), decimalPlaces(base))
    const factor = 10 ** precision
    let next = Math.round((base + direction * step) * factor) / factor
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    setDraft(String(next))
    validityCallback.current?.(true)
    lastEmittedValue.current = next
    onChange(next)
  }

  return (
    <TextInput
      {...props}
      value={draft}
      disabled={disabled}
      inputMode="decimal"
      error={error ?? validationError}
      onChange={(event: ChangeEvent<HTMLInputElement>) => updateDraft(event.currentTarget.value)}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented || disabled) return
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault()
          adjust(event.key === 'ArrowUp' ? 1 : -1)
        }
      }}
      rightSectionPointerEvents="all"
      rightSectionWidth={48}
      rightSection={(
        <div className="validated-number-controls" aria-hidden={disabled || undefined}>
          <UnstyledButton
            type="button"
            tabIndex={-1}
            disabled={disabled || (max !== undefined && inRange && parsed === max)}
            aria-label={t('generic.number_increase')}
            onClick={() => adjust(1)}
          >
            <IconChevronUp size={17} />
          </UnstyledButton>
          <UnstyledButton
            type="button"
            tabIndex={-1}
            disabled={disabled || (min !== undefined && inRange && parsed === min)}
            aria-label={t('generic.number_decrease')}
            onClick={() => adjust(-1)}
          >
            <IconChevronDown size={17} />
          </UnstyledButton>
        </div>
      )}
    />
  )
}
