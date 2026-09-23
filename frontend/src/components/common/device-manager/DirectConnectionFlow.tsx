import { ActionIcon, Button, CloseButton, Group, Loader, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react'
import type { DirectConnectionState } from './types'

type Props = {
  state: DirectConnectionState
  onBack: () => void
  onClose: () => void
  onRetry: () => void
}

export function DirectConnectionFlow({ state, onBack, onClose, onRetry }: Props) {
  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Group gap="xs"><ActionIcon variant="subtle" color="gray" onClick={onBack}><IconArrowLeft size={18} /></ActionIcon><Text fw={700} size="lg">Wireless Direct</Text></Group>
        <CloseButton onClick={onClose} />
      </Group>
      <Stack align="center" justify="center" py="xl" gap="md" style={{ minHeight: 260 }}>
        {state.status === 'loading' ? <>
          <Loader size="xl" type="oval" color="blue" />
          <Stack align="center" gap={4} mt="sm">
            <Text fw={600} size="md">正在驗證 WiFi Remote Pairing 信任...</Text>
            <Text size="xs" c="dimmed" ta="center" maw={360}>這一步會確認這台 iPhone 是否已允許此電腦透過 WiFi 建立模擬定位通道。</Text>
          </Stack>
        </> : <>
          <ThemeIcon color="red" variant="light" size={48} radius="xl"><IconAlertCircle size={28} /></ThemeIcon>
          <Stack align="center" gap={4}>
            <Text fw={600} size="md" c="red">連線建立失敗</Text>
            <Text size="xs" c="dimmed" ta="center" maw={360}>{state.errorMessage || '請確認手機已在同一 Wi-Fi，且已解鎖並信任此電腦。'}</Text>
          </Stack>
          <Group mt="md"><Button variant="default" onClick={onBack}>返回端點清單</Button><Button color="blue" onClick={onRetry}>重新連線</Button></Group>
        </>}
      </Stack>
    </Stack>
  )
}
