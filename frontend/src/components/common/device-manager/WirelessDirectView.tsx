import { useMemo, useState } from 'react'
import { ActionIcon, Button, CloseButton, Collapse, Group, Loader, Paper, ScrollArea, Select, Stack, Text, TextInput, ThemeIcon } from '@mantine/core'
import { IconArrowLeft, IconRefresh, IconWifi } from '@tabler/icons-react'
import type { Device, WirelessDirectEndpoint } from '../../../services/api'
import type { DirectConnectRequest, ManagedDevice } from './types'
import { normalizeDeviceId } from './useDeviceManagerController'

function displayDate(value?: string | null) {
  if (value) return value.replace('T', ' ').slice(0, 16)
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function sameUdid(a?: string | null, b?: string | null) {
  return Boolean(a && b && normalizeDeviceId(a) === normalizeDeviceId(b))
}

type Props = {
  endpoints: WirelessDirectEndpoint[]
  devices: Device[]
  managedDevices: ManagedDevice[]
  deviceNames: Record<string, string>
  isScanning: boolean
  lastScanTime: string
  onBack: () => void
  onClose: () => void
  onRefresh: () => void
  onConnect: (request: DirectConnectRequest) => void
}

export function WirelessDirectView(props: Props) {
  const [manualOpen, setManualOpen] = useState(false)
  const [manualIp, setManualIp] = useState('')
  const [manualPort, setManualPort] = useState('')
  const [targetUdid, setTargetUdid] = useState('')
  const targetOptions = useMemo(() => [
    { value: '', label: '自動偵測已配對裝置' },
    ...props.managedDevices.map((item) => ({ value: item.udid, label: `${item.name} (${item.udid.slice(0, 8)}...)` })),
  ], [props.managedDevices])

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center"><Group gap="xs"><ActionIcon variant="subtle" color="gray" onClick={props.onBack}><IconArrowLeft size={18} /></ActionIcon><Text fw={700} size="lg">Wireless Direct</Text></Group><CloseButton onClick={props.onClose} /></Group>
      <Group justify="space-between" align="center"><Text size="xs" c="dimmed">找到以下 IP 端點</Text><Group gap={6}>{props.lastScanTime && <Text size="xs" c="dimmed">最後更新時間: {props.lastScanTime}</Text>}<ActionIcon variant="subtle" size="xs" color="gray" loading={props.isScanning} onClick={props.onRefresh} title="重新整理端點"><IconRefresh size={14} /></ActionIcon></Group></Group>
      {props.isScanning && props.endpoints.length === 0 ? (
        <Stack align="center" justify="center" py="xl" gap="sm"><Loader size="md" color="blue" /><Text size="xs" c="dimmed">正在搜尋區域網路中的 iPhone 端點...</Text></Stack>
      ) : props.endpoints.length === 0 ? (
        <Paper withBorder p="xl" radius="md" style={{ textAlign: 'center' }}><Text size="sm" c="dimmed">目前在區域網路中未掃描到可用端點。</Text><Text size="xs" c="dimmed" mt={4}>請確認手機與電腦連接至同一 Wi-Fi，且手機螢幕已解鎖。</Text></Paper>
      ) : (
        <ScrollArea.Autosize mah={280}><Stack gap="xs">{props.endpoints.map((endpoint) => {
          const history = endpoint.status === 'history'
          const matched = endpoint.udid ? props.devices.find((item) => sameUdid(item.udid, endpoint.udid)) : undefined
          const name = matched ? props.deviceNames[normalizeDeviceId(matched.udid)] || matched.name : endpoint.device_name || 'iPhone'
          // A DNS-SD identifier is accepted only after the scanner matches it
          // to an authorized UDID. Preserve that identity so a retry refreshes
          // the exact USB phone instead of probing every pairing record.
          const request = { targetUdid: endpoint.udid || matched?.udid || '', targetIp: endpoint.ip, targetName: name, fallbackBonjour: history, port: endpoint.port }
          const subtitle = history ? `歷史連線紀錄： ${endpoint.device_name || name} 於 ${displayDate(endpoint.last_connected)}` : endpoint.last_connected ? `上次連線: ${displayDate(endpoint.last_connected)}` : null
          return (
            <Paper key={endpoint.endpoint} withBorder p="sm" radius="md" className="device-manager-secondary-card">
              <Group justify="space-between" wrap="nowrap"><Group gap="sm" wrap="nowrap"><ThemeIcon variant="light" color={history ? 'orange' : 'teal'} size="md" radius="xl"><span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: history ? '#fd7e14' : '#12b886', display: 'inline-block' }} /></ThemeIcon><div><Text fw={600} size="sm">{endpoint.endpoint}</Text>{subtitle && <Text size="xs" c="dimmed">{subtitle}</Text>}</div></Group><Button size="xs" variant="light" color="arcBlue" leftSection={<IconWifi size={14} />} onClick={() => props.onConnect(request)}>點擊連線</Button></Group>
            </Paper>
          )
        })}</Stack></ScrollArea.Autosize>
      )}
      <div>
        <Button variant="subtle" size="compact-xs" color="gray" onClick={() => setManualOpen((open) => !open)}>{manualOpen ? '收合手動輸入' : '進階：手動輸入 IP 位址'}</Button>
        <Collapse in={manualOpen}><Paper withBorder p="sm" radius="md" mt="xs"><Stack gap="xs"><Group gap="xs" grow><Select size="xs" label="目標裝置" placeholder="選擇裝置或自動偵測" data={targetOptions} value={targetUdid} onChange={(value) => setTargetUdid(value || '')} /><TextInput size="xs" label="手機 IP 位址" placeholder="192.168.1.105" value={manualIp} onChange={(event) => setManualIp(event.currentTarget.value)} /><TextInput size="xs" label="RemotePairing 連接埠" placeholder="以掃描結果為準" value={manualPort} onChange={(event) => setManualPort(event.currentTarget.value.replace(/\D/g, '').slice(0, 5))} /></Group><Text size="xs" c="dimmed">iOS 17+ 的連接埠由手機動態廣播，並非固定 49152。請填入 DNS-SD 掃描顯示的埠號。</Text><Group justify="flex-end"><Button size="xs" color="blue" disabled={!manualIp.trim() || Number(manualPort) < 1 || Number(manualPort) > 65535} onClick={() => { const target = props.managedDevices.find((item) => item.udid === targetUdid); props.onConnect({ targetUdid, targetIp: manualIp.trim(), targetName: target?.name || '已配對裝置', fallbackBonjour: false, port: Number(manualPort) }) }}>連線</Button></Group></Stack></Paper></Collapse>
      </div>
      <Group justify="flex-end" mt="xs"><Button variant="default" onClick={props.onBack}>返回裝置清單</Button></Group>
    </Stack>
  )
}
