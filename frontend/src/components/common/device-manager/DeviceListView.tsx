import { ActionIcon, Badge, Button, CloseButton, Group, Paper, ScrollArea, Stack, Switch, Text, Tooltip } from '@mantine/core'
import { IconDeviceMobile, IconDevices, IconHelpCircle, IconPencil, IconUsb, IconWifi } from '@tabler/icons-react'
import type { DeviceState } from '../../panels/types'
import { DEVICE_MANAGER_CAPACITY, normalizeDeviceId } from './useDeviceManagerController'
import type { DirectConnectRequest, ManagedDevice } from './types'
import { QuickReconnectList } from './QuickReconnectList'
import type { QuickReconnectRecord } from '../../../services/api'

const stateLabels: Record<DeviceState, string> = {
  idle: '待命', teleporting: '瞬移中', navigating: '導航中', looping: '循環中', random_walk: '漫遊中', joystick: '搖桿中', paused: '已暫停',
  'paused:navigating': '導航已暫停', 'paused:looping': '循環已暫停', 'paused:random_walk': '漫遊已暫停', 'paused:joystick': '搖桿已暫停',
}

type Props = {
  devices: ManagedDevice[]
  activeCount: number
  deviceStates: Record<string, DeviceState>
  hidingDeviceId?: string | null
  restoringDeviceId?: string | null
  pairingBusyId: string | null
  quickReconnects: QuickReconnectRecord[]
  onClose: () => void
  onOpenDirect: () => void
  onRename: (device: ManagedDevice) => void
  onToggle: (device: ManagedDevice, checked: boolean) => void
  onPair: (device: ManagedDevice) => void
  onQuickConnect: (request: DirectConnectRequest) => void
  onClearQuickReconnects: () => void
}

export function DeviceListView(props: Props) {
  return (
    <Stack gap="md" className="device-manager-list-view">
      <Group justify="space-between" align="center">
        <Group gap={6}><Text fw={700} size="lg">裝置清單</Text><Tooltip label="在此管理已連接的裝置，可隨時切換開關啟用定位控制席位。" withArrow><ActionIcon variant="transparent" size="xs" color="gray"><IconHelpCircle size={16} /></ActionIcon></Tooltip></Group>
        <CloseButton onClick={props.onClose} />
      </Group>
      <Group justify="space-between" align="center" className="device-manager-toolbar">
        <div className="device-manager-capacity" aria-label={`已啟用 ${props.activeCount} 台，共可啟用 ${DEVICE_MANAGER_CAPACITY} 台`}><IconDevices size={17} stroke={1.8} aria-hidden="true" /><span>已啟用</span><strong>{props.activeCount} / {DEVICE_MANAGER_CAPACITY}</strong></div>
        <Button variant="default" color="arcBlue" size="xs" leftSection={<IconWifi size={16} stroke={1.8} />} onClick={props.onOpenDirect} className="device-manager-direct-link">Wireless Direct</Button>
      </Group>
      {props.devices.length === 0 ? (
        <Paper withBorder p="xl" radius="md" style={{ textAlign: 'center' }}><Text size="sm" c="dimmed">目前尚未偵測到任何裝置。請以 USB 接上手機並於螢幕點擊「信任這台電腦」。</Text></Paper>
      ) : (
        <ScrollArea.Autosize mah={320}><Stack gap="xs">{props.devices.map((item) => {
          const busy = normalizeDeviceId(props.hidingDeviceId || '') === normalizeDeviceId(item.udid)
            || normalizeDeviceId(props.restoringDeviceId || '') === normalizeDeviceId(item.udid)
          const state = props.deviceStates[item.udid] || 'idle'
          return (
            <Paper key={item.udid} withBorder p="sm" radius="md" className={`device-manager-card${item.isActive ? ' is-active' : ''}`}>
              <Group justify="space-between" wrap="nowrap" gap="sm">
                <Group gap="sm" wrap="nowrap" className="device-manager-card-main">
                  <span className="device-manager-phone-icon" aria-hidden="true"><IconDeviceMobile size={22} stroke={1.7} /></span>
                  <div className="device-manager-card-details">
                    <Group gap="xs" wrap="nowrap"><Text fw={600} size="sm" className="device-manager-device-name">{item.name}</Text><Tooltip label="自訂裝置名稱" withArrow><ActionIcon variant="subtle" color="gray" size="xs" onClick={() => props.onRename(item)}><IconPencil size={13} /></ActionIcon></Tooltip></Group>
                    <Group gap={6} mt={2} wrap="nowrap">
                      <Text size="xs" c="dimmed">{item.model}{item.ios_version ? ` · iOS ${item.ios_version}` : ''}</Text>
                      {item.connection_type === 'usb' && <Badge size="xs" variant="light" color="teal" tt="none" className="device-manager-connection-badge" leftSection={<IconUsb size={10} />}>USB</Badge>}
                      {item.connection_type === 'wireless_direct' && <Badge size="xs" variant="light" color="arcBlue" tt="none" className="device-manager-connection-badge" leftSection={<IconWifi size={10} />}>Wireless Direct</Badge>}
                      {item.connection_type === 'wifi' && <Badge size="xs" variant="light" color="cyan" tt="none" className="device-manager-connection-badge" leftSection={<IconWifi size={10} />}>Wi-Fi</Badge>}
                      {state !== 'idle' && <Badge size="xs" variant="filled" color="green">{stateLabels[state]}</Badge>}
                    </Group>
                    {item.device && item.connection_type === 'usb' && Number.parseInt(item.ios_version, 10) >= 16 && (
                      <Button size="compact-xs" variant="subtle" color="blue" mt={4} loading={props.pairingBusyId === item.udid} onClick={() => props.onPair(item)}>{item.direct_paired ? '刷新無線授權' : '配對此裝置（啟用 Wi-Fi 連線）'}</Button>
                    )}
                  </div>
                </Group>
                <Switch checked={item.isActive} disabled={busy} onChange={(event) => props.onToggle(item, event.currentTarget.checked)} size="md" color="arcBlue" aria-label={`切換 ${item.name} 啟用狀態`} />
              </Group>
            </Paper>
          )
        })}</Stack></ScrollArea.Autosize>
      )}
      <QuickReconnectList records={props.quickReconnects} onConnect={props.onQuickConnect} onClear={props.onClearQuickReconnects} />
      <Group justify="flex-end" mt="xs"><Button variant="default" onClick={props.onClose}>關閉</Button></Group>
    </Stack>
  )
}
