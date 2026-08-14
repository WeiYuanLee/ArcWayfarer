import type { ReactNode } from 'react'
import { Paper, Stack, Text } from '@mantine/core'

export type PanelSectionProps = {
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  /** Use a bordered surface only for independently scannable, dense content. */
  variant?: 'plain' | 'surface'
}

/** A consistently spaced group of related mode settings. */
export function PanelSection({ title, description, children, variant = 'plain' }: PanelSectionProps) {
  const content = (
    <Stack gap="sm">
      {(title || description) && (
        <Stack gap={2}>
          {title && <Text size="sm" fw={600}>{title}</Text>}
          {description && <Text size="xs" c="dimmed">{description}</Text>}
        </Stack>
      )}
      {children}
    </Stack>
  )

  return variant === 'surface'
    ? <Paper withBorder p="md" radius="md">{content}</Paper>
    : <section>{content}</section>
}
