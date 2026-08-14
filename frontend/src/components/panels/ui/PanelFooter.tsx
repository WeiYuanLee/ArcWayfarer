import type { ReactNode } from 'react'
import { Group } from '@mantine/core'

export type PanelFooterProps = {
  children: ReactNode
  /** Secondary actions go first; the primary action is aligned at the end. */
  justify?: 'apart' | 'flex-end' | 'space-between'
}

/** Fixed action row used with ModePanelLayout's footer slot. */
export function PanelFooter({ children, justify = 'apart' }: PanelFooterProps) {
  return <Group justify={justify === 'apart' ? 'space-between' : justify} align="center" wrap="wrap">{children}</Group>
}
