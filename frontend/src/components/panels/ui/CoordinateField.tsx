import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { TextInput } from '@mantine/core'

export type CoordinateFieldProps = Omit<ComponentPropsWithoutRef<typeof TextInput>, 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
  /** Optional compact action such as a favorite toggle. */
  rightSection?: ReactNode
}

/** Standard coordinate / URL field. The calling panel owns parsing and map-picking. */
export function CoordinateField({ value, onChange, rightSection, ...props }: CoordinateFieldProps) {
  return (
    <TextInput
      {...props}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      rightSection={rightSection}
    />
  )
}
