import { ActionIcon, Badge, Button, Divider, Group, Modal, Paper, ScrollArea, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { IconDeviceMobile, IconEye, IconEyeOff, IconPencil, IconUsb, IconWifi } from '@tabler/icons-react'
import type { HiddenDevice } from '../../hooks/useHiddenDevices'
import type { Device } from '../../services/api'
import type { DeviceState } from '../panels/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  /** Complete discovery output, before hidden devices are filtered from the UI. */
  devices: Device[]
  /** Persistent records are preferred; `hiddenUdids` supports a string-only caller. */
  hiddenDevices?: HiddenDevice[]
  hiddenUdids?: readonly string[] | ReadonlySet<string>
  /** Devices admitted by the parent's three-device capacity policy. Omit to admit every visible device. */
  usableDeviceIds?: readonly string[] | ReadonlySet<string>
  deviceNames: Record<string, string>
  deviceStates: Record<string, DeviceState>
  /** UDID currently being restored to its real location and then hidden. */
  hidingDeviceId?: string | null
  onHideDevice: (device: Device) => void | Promise<void>
  onUnhideDevice: (udid: string) => void
  onSetDeviceName: (udid: string, name: string) => void
  /** For example, disable restore while all three usable slots are occupied. */
  isUnhideDisabled?: (udid: string) => boolean
  unhideDisabledReason?: (udid: string) => string | undefined
}

const stateLabels: Record<DeviceState, string> = {
  idle: '待命', teleporting: '瞬移中', navigating: '導航中', looping: '循環中', random_walk: '漫遊中', joystick: '搖桿中',
  paused: '已暫停', 'paused:navigating': '導航已暫停', 'paused:looping': '循環已暫停', 'paused:random_walk': '漫遊已暫停', 'paused:joystick': '搖桿已暫停',
}

function deviceName(device: Pick<Device, 'name' | 'udid'>, customName?: string) {
  if (customName) return customName
  return device.name.toLowerCase() === device.udid.toLowerCase() ? device.udid.slice(-8) : device.name
}

function normalized(udid: string) { return udid.trim().toLowerCase() }

function transportLabel(connectionType: Device['connection_type']) {
  if (connectionType === 'wifi') return <Badge variant="light" color="blue" leftSection={<IconWifi size={11} />}>Wi-Fi</Badge>
  if (connectionType === 'usb') return <Badge variant="light" color="gray" leftSection={<IconUsb size={11} />}>USB</Badge>
  return null
}

export function DeviceManagerModal({ isOpen, onClose, devices, hiddenDevices = [], hiddenUdids, usableDeviceIds, deviceNames, deviceStates, hidingDeviceId = null, onHideDevice, onUnhideDevice, onSetDeviceName, isUnhideDisabled, unhideDisabledReason }: Props) {
  const hiddenKeys = new Set<string>(hiddenDevices.map((device) => normalized(device.udid)))
  if (hiddenUdids) for (const udid of hiddenUdids) hiddenKeys.add(normalized(udid))
  const usableKeys = usableDeviceIds ? new Set([...usableDeviceIds].map(normalized)) : null

  const devicesByUdid = new Map(devices.map((device) => [normalized(device.udid), device]))
  const visibleDevices = devices.filter((device) => !hiddenKeys.has(normalized(device.udid)))
  const availableDevices = visibleDevices.filter((device) => !usableKeys || usableKeys.has(normalized(device.udid)))
  const overflowDevices = visibleDevices.filter((device) => usableKeys && !usableKeys.has(normalized(device.udid)))
  const customName = (udid: string) => deviceNames[normalized(udid)]
  const hiddenRows = [...hiddenKeys].map((key) => {
    const connected = devicesByUdid.get(key)
    const stored = hiddenDevices.find((device) => normalized(device.udid) === key)
    return { udid: connected?.udid || stored?.udid || key, name: connected ? deviceName(connected, customName(connected.udid)) : customName(stored?.udid || key) || stored?.name || key.slice(-8), connected, stored }
  })
  const rename = (udid: string, fallbackName: string) => {
    const value = window.prompt('自訂裝置名稱（留白可恢復系統名稱）', customName(udid) || fallbackName)
    if (value !== null) onSetDeviceName(udid, value === fallbackName ? '' : value)
  }

  return (
    <Modal opened={isOpen} onClose={onClose} title="裝置管理" centered size="lg">
      <Stack gap="md">
        <Text size="sm" c="dimmed">遮蔽的裝置不會出現在右上角，也不會被操作。點擊鉛筆可設定此電腦專用的自訂名稱。</Text>
        <Stack gap="xs">
          <Group justify="space-between"><Text fw={600}>可使用裝置</Text><Badge variant="light">{availableDevices.length}</Badge></Group>
          {availableDevices.length === 0 ? <Text size="sm" c="dimmed">目前沒有可使用裝置。</Text> : <ScrollArea.Autosize mah={260}><Stack gap="xs">{availableDevices.map((device) => {
            const state = deviceStates[device.udid] || 'idle'
            const isHiding = normalized(hidingDeviceId || '') === normalized(device.udid)
            return <Paper key={device.udid} withBorder p="sm"><Group justify="space-between" wrap="nowrap"><Group gap="sm" wrap="nowrap"><ThemeIcon variant="light" color="blue"><IconDeviceMobile size={17} /></ThemeIcon><div><Group gap="xs"><Text size="sm" fw={600}>{deviceName(device, customName(device.udid))}</Text>{transportLabel(device.connection_type)}</Group><Text size="xs" c="dimmed">{device.udid.slice(-8)}{device.ios_version ? ` · iOS ${device.ios_version}` : ''} · {stateLabels[state]}</Text></div></Group><Group gap={4} wrap="nowrap"><Tooltip label="編輯自訂名稱"><ActionIcon variant="subtle" color="gray" onClick={() => rename(device.udid, deviceName(device))} aria-label="編輯自訂名稱"><IconPencil size={16} /></ActionIcon></Tooltip><Button size="compact-sm" color="gray" variant="light" leftSection={<IconEyeOff size={14} />} loading={isHiding} disabled={Boolean(hidingDeviceId) && !isHiding} onClick={() => void onHideDevice(device)}>遮蔽</Button></Group></Group></Paper>
          })}</Stack></ScrollArea.Autosize>}
        </Stack>
        {overflowDevices.length > 0 && <>
          <Divider />
          <Stack gap="xs">
            <Group justify="space-between"><Text fw={600}>等待可用裝置</Text><Badge variant="light" color="orange">{overflowDevices.length}</Badge></Group>
            <Text size="xs" c="dimmed">已達三台可使用裝置上限。請先遮蔽一台可使用裝置，才能使用以下裝置。</Text>
            <ScrollArea.Autosize mah={180}><Stack gap="xs">{overflowDevices.map((device) => <Paper key={device.udid} withBorder p="sm"><Group justify="space-between" wrap="nowrap"><Group gap="sm" wrap="nowrap"><ThemeIcon variant="light" color="orange"><IconDeviceMobile size={17} /></ThemeIcon><div><Group gap="xs"><Text size="sm" fw={600}>{deviceName(device, customName(device.udid))}</Text>{transportLabel(device.connection_type)}</Group><Text size="xs" c="dimmed">{device.udid.slice(-8)}{device.ios_version ? ` · iOS ${device.ios_version}` : ''}</Text></div></Group><Tooltip label="編輯自訂名稱"><ActionIcon variant="subtle" color="gray" onClick={() => rename(device.udid, deviceName(device))} aria-label="編輯自訂名稱"><IconPencil size={16} /></ActionIcon></Tooltip></Group></Paper>)}</Stack></ScrollArea.Autosize>
          </Stack>
        </>}
        <Divider />
        <Stack gap="xs">
          <Group justify="space-between"><Text fw={600}>已遮蔽裝置</Text><Badge variant="light" color="gray">{hiddenRows.length}</Badge></Group>
          {hiddenRows.length === 0 ? <Text size="sm" c="dimmed">尚未遮蔽任何裝置。</Text> : <ScrollArea.Autosize mah={220}><Stack gap="xs">{hiddenRows.map((row) => { const disabled = isUnhideDisabled?.(row.udid) || false; return <Paper key={row.udid} withBorder p="sm" bg="var(--aw-surface-raised)"><Group justify="space-between" wrap="nowrap"><Group gap="sm" wrap="nowrap"><ThemeIcon variant="light" color="gray"><IconEyeOff size={17} /></ThemeIcon><div><Group gap="xs"><Text size="sm" fw={600}>{row.name}</Text>{row.connected ? transportLabel(row.connected.connection_type) : <Badge variant="light" color="gray">未連線</Badge>}</Group><Text size="xs" c="dimmed">{row.udid.slice(-8)}{row.connected?.ios_version || row.stored?.iosVersion ? ` · iOS ${row.connected?.ios_version || row.stored?.iosVersion}` : ''}</Text></div></Group><Group gap={4} wrap="nowrap"><Tooltip label="編輯自訂名稱"><ActionIcon variant="subtle" color="gray" onClick={() => rename(row.udid, row.name)} aria-label="編輯自訂名稱"><IconPencil size={16} /></ActionIcon></Tooltip><Button size="compact-sm" variant="light" leftSection={<IconEye size={14} />} disabled={disabled} title={disabled ? unhideDisabledReason?.(row.udid) : undefined} onClick={() => onUnhideDevice(row.udid)}>恢復顯示</Button></Group></Group></Paper> })}</Stack></ScrollArea.Autosize>}
        </Stack>
        <Group justify="flex-end"><Button variant="default" onClick={onClose}>關閉</Button></Group>
      </Stack>
    </Modal>
  )
}
