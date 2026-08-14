import type { ReactNode } from 'react'
import { Alert } from '@mantine/core'

export type PanelNoticeProps = {
  children: ReactNode
  title?: ReactNode
  tone?: 'info' | 'warning' | 'error' | 'success'
}

/** Semantic, accessible device and mode availability feedback. */
export function PanelNotice({ children, title, tone = 'info' }: PanelNoticeProps) {
  const color = tone === 'success' ? 'green' : tone
  return <Alert variant="light" color={color} title={title} py="xs">{children}</Alert>
}
