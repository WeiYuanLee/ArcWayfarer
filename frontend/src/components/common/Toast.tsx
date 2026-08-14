import { notifications } from '@mantine/notifications'

export function showToast(message: string) {
  notifications.show({
    message,
    autoClose: 2500,
    withCloseButton: false,
  })
}

/** @deprecated Notifications is rendered by AppProviders. */
export function ToastContainer() {
  return null
}
