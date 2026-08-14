import { Alert, Group, Loader, Text } from '@mantine/core'

export type PanelStatusProps = {
  state: 'busy' | 'success' | 'error'
  message?: string
}

/** Persistent operation feedback positioned beneath the panel's footer. */
export function PanelStatus({ state, message }: PanelStatusProps) {
  if (state === 'busy') {
    return <Group gap="xs" role="status"><Loader size="xs" /><Text size="sm" c="dimmed">{message}</Text></Group>
  }

  return (
    <Alert color={state === 'success' ? 'green' : 'red'} variant="light" py="xs">
      {message}
    </Alert>
  )
}
