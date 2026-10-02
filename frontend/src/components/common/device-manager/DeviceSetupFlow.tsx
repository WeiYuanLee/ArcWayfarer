import { Alert, Button, CloseButton, Group, Loader, Paper, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconAlertCircle, IconCheck, IconChevronLeft, IconDeviceMobile, IconLockOpen, IconSettings } from '@tabler/icons-react'
import type { DeviceSetupState } from './types'

type Props = {
  state: DeviceSetupState
  onBack: () => void
  onClose: () => void
  onRequestTrust: () => void
  onRevealDeveloperMode: () => void
  onCheckDeveloperMode: () => void
}

function BusyStep({ title, description }: { title: string; description: string }) {
  return <Stack align="center" gap="sm" py="xl">
    <Loader size="md" />
    <Text fw={700}>{title}</Text>
    <Text size="sm" c="dimmed" ta="center">{description}</Text>
  </Stack>
}

export function DeviceSetupFlow(props: Props) {
  const { state } = props
  return <Stack gap="lg">
    <Group justify="space-between">
      <Button variant="subtle" color="gray" px={0} leftSection={<IconChevronLeft size={18} />} onClick={props.onBack}>返回裝置清單</Button>
      <CloseButton onClick={props.onClose} />
    </Group>

    <Group gap="sm">
      <ThemeIcon size="lg" radius="md" variant="light"><IconDeviceMobile size={22} /></ThemeIcon>
      <div><Text fw={700}>設定這台 iPhone</Text><Text size="sm" c="dimmed">{state.device.name}</Text></div>
    </Group>

    <Paper withBorder radius="md" p="lg">
      {state.step === 'unlock' && <Stack gap="md">
        <ThemeIcon size="xl" radius="xl" variant="light"><IconLockOpen size={24} /></ThemeIcon>
        <div><Text fw={700}>請先解鎖 iPhone</Text><Text size="sm" c="dimmed" mt={4}>請保持 USB 連線，解鎖手機並停留在主畫面。下一步會由 ArcWayfarer 請求「信任這部電腦」。</Text></div>
        <Button onClick={props.onRequestTrust}>我已解鎖，繼續</Button>
      </Stack>}

      {state.step === 'requesting_trust' && <BusyStep title="等待 iPhone 確認信任" description="請查看 iPhone 畫面，點選「信任」並依照提示輸入手機密碼。完成後會自動繼續。" />}

      {state.step === 'developer_mode' && <Stack gap="md">
        <ThemeIcon size="xl" radius="xl" variant="light" color="orange"><IconSettings size={24} /></ThemeIcon>
        <div><Text fw={700}>需要開啟開發者模式</Text><Text size="sm" c="dimmed" mt={4}>請先讓 ArcWayfarer 在 iPhone 上顯示「開發者模式」選項，再前往「設定 → 隱私權與安全性 → 開發者模式」完成設定。</Text></div>
        <Button onClick={props.onRevealDeveloperMode}>在 iPhone 上顯示開發者模式選項</Button>
      </Stack>}

      {state.step === 'revealing_developer_mode' && <BusyStep title="正在準備開發者模式設定" description="請保持 iPhone 解鎖並維持 USB 連線。" />}

      {state.step === 'waiting_for_developer_mode' && <Stack gap="md">
        <Alert color="blue" icon={<IconSettings size={18} />} title="已顯示開發者模式選項">
          請前往 iPhone 的「設定 → 隱私權與安全性 → 開發者模式」將它開啟，並依照 iOS 指示重新啟動。
        </Alert>
        <Text size="sm" c="dimmed">iPhone 重新啟動並接回 USB 後，ArcWayfarer 會再次確認狀態。</Text>
        <Button onClick={props.onCheckDeveloperMode}>重新檢查開發者模式</Button>
      </Stack>}

      {state.step === 'authorizing_wifi' && <BusyStep title="正在設定 Wi-Fi 連線授權" description="已確認信任與開發者模式，請保持 USB 連線直到設定完成。" />}

      {state.step === 'complete' && <Stack align="center" gap="md" py="md">
        <ThemeIcon size="xl" radius="xl" color="green"><IconCheck size={25} /></ThemeIcon>
        <div><Text fw={700} ta="center">這台 iPhone 已設定完成</Text><Text size="sm" c="dimmed" ta="center" mt={4}>拔除 USB 後，ArcWayfarer 會在同一個 Wi-Fi 中尋找這台 iPhone。</Text></div>
        <Button onClick={props.onBack}>返回裝置清單</Button>
      </Stack>}

      {state.step === 'error' && <Stack gap="md">
        <Alert color="red" icon={<IconAlertCircle size={18} />} title="無法完成設定">{state.errorMessage}</Alert>
        <Button onClick={state.retryTarget === 'reveal' ? props.onRevealDeveloperMode : props.onRequestTrust}>重新嘗試</Button>
      </Stack>}
    </Paper>
  </Stack>
}
