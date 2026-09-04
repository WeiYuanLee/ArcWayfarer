import type { ReactNode } from 'react'
import { Box, Divider, Group, ScrollArea, Stack, Text, Title } from '@mantine/core'

export type ModePanelLayoutProps = {
  /** The stable, human-readable name of the active mode. */
  title: ReactNode
  /** A short explanation rendered beside the title (usually ModeInfoTooltip). */
  headerAction?: ReactNode
  /** A compact live-state indicator displayed beside the title. */
  titleStatus?: ReactNode
  /** Device or mode availability messages rendered before the form. */
  notices?: ReactNode
  children: ReactNode
  /** Primary actions that must remain available while the body scrolls. */
  footer?: ReactNode
  /** Operation feedback rendered below the footer. */
  status?: ReactNode
  /** Disables the internal scroll body for compact panels. */
  scrollable?: boolean
  /** Keeps a visible draggable scrollbar for long, settings-heavy panels. */
  alwaysShowScrollbar?: boolean
  /** Constrains the body to its flex parent so the shared ScrollArea owns overflow. */
  constrainBody?: boolean
}

/**
 * The common composition contract for every desktop mode panel.
 * It deliberately owns hierarchy and spacing but not the outer floating-card
 * placement, which remains the map layout's responsibility.
 */
export function ModePanelLayout({
  title,
  headerAction,
  titleStatus,
  notices,
  children,
  footer,
  status,
  scrollable = true,
  alwaysShowScrollbar = false,
  constrainBody = false,
}: ModePanelLayoutProps) {
  const body = <Stack gap="lg">{notices}{children}</Stack>

  return (
    <Box
      component="section"
      aria-label={typeof title === 'string' ? title : undefined}
      style={{ display: 'flex', minHeight: 0, flex: 1, flexDirection: 'column', ...(constrainBody ? { height: '100%', overflow: 'hidden' } : {}) }}
    >
      <Group align="center" gap="xs" mb="md" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <Title order={2} size="h4" fw={600}>{title}</Title>
          {headerAction}
          {titleStatus}
        </Group>
      </Group>

      {scrollable ? (
        <ScrollArea type={alwaysShowScrollbar ? "always" : "auto"} offsetScrollbars style={{ minHeight: 0, flex: 1 }}>
          <Box>{body}</Box>
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
