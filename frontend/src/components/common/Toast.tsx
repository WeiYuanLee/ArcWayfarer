import { Button, Group, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAlertTriangle, IconCheck, IconInfoCircle, IconX } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { toUserFacingError } from '../../utils/userFacingError'

export type NoticeTone = 'success' | 'info' | 'warning' | 'error'

export type NoticeOptions = {
  id?: string
  title?: string
  autoClose?: number | false
  withCloseButton?: boolean
}

export type ActionNoticeOptions = NoticeOptions & {
  message: string
  actionLabel: string
  onAction: () => void
  tone?: NoticeTone
}

const NOTICE_STYLE: Record<NoticeTone, { color: string; autoClose: number; icon: ReactNode }> = {
  success: { color: 'green', autoClose: 3000, icon: <IconCheck size={17} /> },
  info: { color: 'blue', autoClose: 4000, icon: <IconInfoCircle size={17} /> },
  warning: { color: 'yellow', autoClose: 6000, icon: <IconAlertTriangle size={17} /> },
  error: { color: 'red', autoClose: 8000, icon: <IconX size={17} /> },
}

function showNotice(tone: NoticeTone, message: ReactNode, options: NoticeOptions = {}) {
  const style = NOTICE_STYLE[tone]
  const data = {
    id: options.id,
    title: options.title,
    message,
    color: style.color,
    icon: style.icon,
    autoClose: options.autoClose ?? style.autoClose,
    withCloseButton: options.withCloseButton ?? tone === 'error',
  }

  // A stable id turns repeated state broadcasts into one updated notification
  // instead of stacking the same message several times.
  if (options.id) {
    notifications.hide(options.id)
  }
  return notifications.show(data)
}

/**
 * The single entry point for short-lived user feedback. Components choose the
 * semantic outcome; placement, color, duration, deduplication and actions stay
 * centralized here.
 */
export const notify = {
  success: (message: ReactNode, options?: NoticeOptions) => showNotice('success', message, options),
  info: (message: ReactNode, options?: NoticeOptions) => showNotice('info', message, options),
  warning: (message: ReactNode, options?: NoticeOptions) => showNotice('warning', message, options),
  error: (message: ReactNode, options?: NoticeOptions) => showNotice('error', message, options),
  failure: (error: unknown, fallback: string, options?: NoticeOptions) =>
    showNotice('error', toUserFacingError(error, fallback), options),
  action: ({ message, actionLabel, onAction, tone = 'success', ...options }: ActionNoticeOptions) => {
    let notificationId = options.id ?? ''
    const content = (
      <Group gap="sm" wrap="nowrap" justify="space-between">
        <Text size="sm" style={{ flex: 1 }}>{message}</Text>
        <Button
          size="compact-xs"
          variant="subtle"
          color={NOTICE_STYLE[tone].color}
          onClick={() => {
            onAction()
            if (notificationId) notifications.hide(notificationId)
          }}
        >
          {actionLabel}
        </Button>
      </Group>
    )
    notificationId = showNotice(tone, content, {
      ...options,
      autoClose: options.autoClose ?? 10_000,
      withCloseButton: options.withCloseButton ?? true,
    })
    return notificationId
  },
  hide: (id: string) => notifications.hide(id),
}

/** Compatibility shim for existing call sites while they migrate by outcome. */
export function showToast(message: string) {
  return notify.info(message)
}

/** @deprecated Notifications is rendered by AppProviders. */
export function ToastContainer() {
  return null
}
