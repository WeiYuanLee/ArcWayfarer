import type { ReactNode } from 'react'
import { Box, Divider, Group, ScrollArea, Stack, Text, Title } from '@mantine/core'

export type ModePanelLayoutProps = {
  /** The stable, human-readable name of the active mode. */
  title: ReactNode
  /** A short explanation rendered beside the title (usually ModeInfoTooltip). */
  headerAction?: ReactNode
  /** Device or mode availability messages rendered before the form. */
  notices?: ReactNode
  children: ReactNode
  /** Primary actions that must remain available while the body scrolls. */
  footer?: ReactNode
  /** Operation feedback rendered below the footer. */
  status?: ReactNode
  /** Disables the internal scroll body for compact panels. */
  scrollable?: boolean
}

/**
 * The common composition contract for every desktop mode panel.
 * It deliberately owns hierarchy and spacing but not the outer floating-card
 * placement, which remains the map layout's responsibility.
 */
export function ModePanelLayout({
  title,
  headerAction,
  notices,
  children,
  footer,
  status,
  scrollable = true,
}: ModePanelLayoutProps) {
  const body = <Stack gap="lg">{notices}{children}</Stack>

  return (
    <Box
      component="section"
      aria-label={typeof title === 'string' ? title : undefined}
      style={{ display: 'flex', minHeight: 0, flex: 1, flexDirection: 'column' }}
    >
      <Group justify="space-between" align="center" mb="md" wrap="nowrap">
        <Title order={2} size="h4" fw={600}>{title}</Title>
        {headerAction}
      </Group>

      {scrollable ? (
        <ScrollArea type="auto" offsetScrollbars style={{ minHeight: 0, flex: 1 }}>
          <Box pe="xs">{body}</Box>
        </ScrollArea>
      ) : body}

      {(footer || status) && (
        <>
          <Divider my="md" />
          <Stack gap="sm">
            {footer}
            {status}
          </Stack>
        </>
      )}
    </Box>
  )
}
