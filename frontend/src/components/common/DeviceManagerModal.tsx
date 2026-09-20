import {
  ActionIcon,
  Badge,
  Button,
  CloseButton,
  Collapse,
  Group,
  Loader,
  Menu,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import {
  IconAlertCircle,
  IconArrowLeft,
  IconDeviceMobile,
  IconDevices,
  IconDots,
  IconHelpCircle,
  IconPencil,
  IconRefresh,
  IconTrash,
  IconUsb,
  IconWifi,
} from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  clearQuickReconnectRecord,
  clearWirelessDirectAddress,
  connectWirelessDirect,
  getQuickReconnectRecord,
  getWirelessDirectEndpoints,
  pairWirelessDirect,
  saveQuickReconnectRecord,
  type Device,
  type QuickReconnectRecord,
  type WirelessDirectEndpoint,
} from '../../services/api'
import { showToast } from './Toast'
import type { HiddenDevice } from '../../hooks/useHiddenDevices'
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
  restoringDeviceId?: string | null
  onHideDevice: (device: Device) => void | Promise<void>
  onUnhideDevice: (udid: string) => void
  onRestoreDevice?: (udid: string) => void | Promise<void>
  onSetDeviceName: (udid: string, name: string) => void
  onRefreshDevices?: () => void | Promise<void>
  /** For example, disable restore while all three usable slots are occupied. */
  isUnhideDisabled?: (udid: string) => boolean
  unhideDisabledReason?: (udid: string) => string | undefined
}

type ModalView = 'list' | 'wireless_direct' | 'connecting'

const MAX_CAPACITY = 3

const stateLabels: Record<DeviceState, string> = {
  idle: '待命',
  teleporting: '瞬移中',
  navigating: '導航中',
  looping: '循環中',
  random_walk: '漫遊中',
  joystick: '搖桿中',
  paused: '已暫停',
  'paused:navigating': '導航已暫停',
  'paused:looping': '循環已暫停',
  'paused:random_walk': '漫遊已暫停',
  'paused:joystick': '搖桿已暫停',
}

function normalized(udid: string) {
  return udid.trim().toLowerCase()
}

function formatCurrentTime() {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const date = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${date} ${hours}:${minutes}`
}

function formatTimeOnly() {
  const d = new Date()
  return d.toTimeString().split(' ')[0]
}

function formatDisplayDate(dateStr?: string | null) {
  if (!dateStr) return formatCurrentTime()
  return dateStr.replace('T', ' ').slice(0, 16)
}

export function DeviceManagerModal({
  isOpen,
  onClose,
  devices,
  hiddenDevices = [],
  hiddenUdids,
  usableDeviceIds,
  deviceNames,
  deviceStates,
  hidingDeviceId = null,
  restoringDeviceId = null,
  onHideDevice,
  onUnhideDevice,
  onSetDeviceName,
  onRefreshDevices,
}: Props) {
  // Navigation state
  const [view, setView] = useState<ModalView>('list')

  // Rename state
  const [renamingDevice, setRenamingDevice] = useState<{ udid: string; fallbackName: string } | null>(null)
  const [nameDraft, setNameDraft] = useState('')

  // Wireless Direct scanning state
  const [endpoints, setEndpoints] = useState<WirelessDirectEndpoint[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [lastScanTime, setLastScanTime] = useState<string>('')
  const [manualIpOpen, setManualIpOpen] = useState(false)
  const [manualIpDraft, setManualIpDraft] = useState('')
  const [manualTargetUdid, setManualTargetUdid] = useState('')

  // Connecting state
  const [connectingState, setConnectingState] = useState<{
    status: 'loading' | 'error'
    targetUdid: string
    targetIp?: string
    targetName: string
    fallbackBonjour: boolean
    errorMessage?: string
  }>({
    status: 'loading',
    targetUdid: '',
    targetName: '',
    fallbackBonjour: true,
  })

  // Quick reconnect cached record
  const [quickReconnect, setQuickReconnect] = useState<QuickReconnectRecord | null>(null)
  const [pairingBusyId, setPairingBusyId] = useState<string | null>(null)

  // Reset view on modal close/open
  useEffect(() => {
    if (isOpen) {
      setView('list')
      setQuickReconnect(getQuickReconnectRecord())
    }
  }, [isOpen])

  // Sets of hidden & usable IDs
  const hiddenKeys = useMemo(() => {
    const keys = new Set<string>(hiddenDevices.map((device) => normalized(device.udid)))
    if (hiddenUdids) {
      for (const udid of hiddenUdids) keys.add(normalized(udid))
    }
    return keys
  }, [hiddenDevices, hiddenUdids])

  const usableKeys = useMemo(() => {
    return usableDeviceIds ? new Set([...usableDeviceIds].map(normalized)) : null
  }, [usableDeviceIds])

  // Unified device list
  const allDevices = useMemo(() => {
    const list: Array<{
      udid: string
      name: string
      rawName: string
      model: string
      ios_version: string
      connection_type?: Device['connection_type']
      status: Device['status'] | 'offline'
      direct_paired?: boolean
      device?: Device
      isActive: boolean
    }> = []

    const seenUdids = new Set<string>()

    // First, connected devices
    for (const d of devices) {
      const key = normalized(d.udid)
      seenUdids.add(key)
      const isHidden = hiddenKeys.has(key)
      const isUsable = !usableKeys || usableKeys.has(key)
      const isActive = !isHidden && isUsable
      const custom = deviceNames[key]
      const rawName = d.name.toLowerCase() === d.udid.toLowerCase() ? d.udid.slice(-8).toUpperCase() : d.name
      const displayName = custom || rawName

      list.push({
        udid: d.udid,
        name: displayName,
        rawName,
        model: 'iPhone',
        ios_version: d.ios_version || '',
        connection_type: d.connection_type,
        status: d.status,
        direct_paired: d.direct_paired,
        device: d,
        isActive,
      })
    }

    // Second, hidden/offline devices
    for (const h of hiddenDevices) {
      const key = normalized(h.udid)
      if (seenUdids.has(key)) continue
      seenUdids.add(key)
      const custom = deviceNames[key]
      const rawName = h.name || h.udid.slice(-8).toUpperCase()
      const displayName = custom || rawName

      list.push({
        udid: h.udid,
        name: displayName,
        rawName,
        model: 'iPhone',
        ios_version: h.iosVersion || '',
        connection_type: undefined,
        status: 'offline',
        direct_paired: false,
        isActive: false,
      })
    }

    return list
  }, [devices, hiddenDevices, hiddenKeys, usableKeys, deviceNames])

  const manualTargetOptions = useMemo(() => {
    const opts = [{ value: '', label: '自動偵測已配對裝置' }]
    allDevices.forEach((d) => {
      opts.push({
        value: d.udid,
        label: `${d.name} (${d.udid.slice(0, 8)}...)`,
      })
    })
    return opts
  }, [allDevices])

  const activeCount = useMemo(() => {
    return allDevices.filter((d) => d.isActive).length
  }, [allDevices])

  // Fetch Wireless Direct Endpoints
  const loadEndpoints = useCallback(async () => {
    setIsScanning(true)
    try {
      const results = await getWirelessDirectEndpoints()
      setEndpoints(results)
      setLastScanTime(formatTimeOnly())
    } catch {
      // Endpoint scanning is best-effort
    } finally {
      setIsScanning(false)
    }
  }, [])

  // When switching to 'wireless_direct' view, auto scan
  useEffect(() => {
    if (view === 'wireless_direct') {
      loadEndpoints()
    }
  }, [view, loadEndpoints])

  // Run Connection Transition
  const executeConnect = useCallback(
    async (
      targetUdid: string,
      targetIp: string | undefined,
      targetName: string,
      fallbackBonjour: boolean = true,
      port = 49152
    ) => {
      setConnectingState({
        status: 'loading',
        targetUdid,
        targetIp,
        targetName,
        fallbackBonjour,
      })
      setView('connecting')

      try {
        // Preserve the port advertised by RemotePairing DNS-SD on Windows.
        const connectedDevice = await connectWirelessDirect(targetUdid, targetIp, fallbackBonjour, port)
        const effectiveUdid = targetUdid || connectedDevice.udid
        const finalName = targetName || connectedDevice.name || 'iPhone'

        // Save quick reconnect cache with true working IP confirmed by backend
        const workingIp = connectedDevice.ip_address || targetIp || ''
        const rec: QuickReconnectRecord = {
          udid: effectiveUdid,
          name: finalName,
          endpoint: workingIp ? `${workingIp.includes(':') ? `[${workingIp}]` : workingIp}:${port}` : String(port),
          ip: workingIp,
          port,
          timestamp: formatCurrentTime(),
        }
        saveQuickReconnectRecord(rec)
        setQuickReconnect(rec)

        // Auto unhide device so it activates on the dashboard IF under capacity
        const isAlreadyActive = allDevices.some((d) => d.udid === effectiveUdid && d.isActive)
        if (isAlreadyActive || activeCount < MAX_CAPACITY) {
          onUnhideDevice(effectiveUdid)
          showToast(`Wireless Direct 已連線並啟用「${rec.name}」`)
        } else {
          showToast(`Wireless Direct 已連線至「${rec.name}」（席位已滿 3 台，請先在清單關閉其他裝置後再啟用）`)
        }
        await onRefreshDevices?.()

        // Transition back to list view
        setView('list')
      } catch (err: any) {
        // The backend may have released an idle stale Direct tunnel so a
        // normal usbmux Wi-Fi route can take over. Refresh immediately instead
        // of leaving the device list showing the obsolete transport.
        await onRefreshDevices?.()
        setConnectingState((prev) => ({
          ...prev,
          status: 'error',
          errorMessage: err instanceof Error ? err.message : '連線失敗，請檢查手機 Wi-Fi 與配對狀態。',
        }))
      }
    },
    [onUnhideDevice, onRefreshDevices, activeCount, allDevices]
  )

  // Toggle Switch Handler
  const handleToggle = useCallback(
    async (item: (typeof allDevices)[0], checked: boolean) => {
      if (checked) {
        if (activeCount >= MAX_CAPACITY) {
          showToast(`已達最大同時控制數量（${MAX_CAPACITY} 台），請先關閉其他裝置。`)
          return
        }
        onUnhideDevice(item.udid)
        showToast(`已啟用裝置「${item.name}」`)
        await onRefreshDevices?.()
      } else {
        if (item.device) {
          await onHideDevice(item.device)
        }
      }
    },
    [activeCount, onUnhideDevice, onHideDevice, onRefreshDevices]
  )

  // Pairing button handler
  const handlePair = async (device: Device) => {
    setPairingBusyId(device.udid)
    try {
      await pairWirelessDirect(device.udid)
      showToast(`已完成 Wi-Fi 連線授權，拔線後即可無線控制。`)
      await onRefreshDevices?.()
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : '配對失敗，請確認手機已解鎖並信任此電腦。')
    } finally {
      setPairingBusyId(null)
    }
  }

  // Rename modal handlers
  const rename = (udid: string, hardwareDefaultName: string) => {
    setRenamingDevice({ udid, fallbackName: hardwareDefaultName })
    setNameDraft(deviceNames[normalized(udid)] || hardwareDefaultName)
  }
  const cancelRename = () => setRenamingDevice(null)
  const saveName = () => {
    if (!renamingDevice) return
    const name = nameDraft.trim()
    // If empty or explicitly set equal to original hardware name, remove custom name override
    if (!name || name === renamingDevice.fallbackName) {
      onSetDeviceName(renamingDevice.udid, '')
    } else {
      onSetDeviceName(renamingDevice.udid, name)
    }
    cancelRename()
  }

  const handleClearQuickReconnect = async () => {
    if (quickReconnect?.udid) {
      try {
        await clearWirelessDirectAddress(quickReconnect.udid)
      } catch (err: any) {
        showToast(err instanceof Error ? err.message : '清除後端連線紀錄失敗，請稍後重試。')
        return
      }
    }
    clearQuickReconnectRecord()
    setQuickReconnect(null)
    showToast('已清除快速復連歷史紀錄')
  }

  return (
    <>
      <Modal
        opened={isOpen}
        onClose={onClose}
        withCloseButton={false}
        centered
        size="lg"
        zIndex={2100}
        padding="lg"
        radius="lg"
        classNames={{ content: 'device-manager-modal', body: 'device-manager-modal-body' }}
      >
        {/* VIEW 1: MAIN LIST VIEW */}
        {view === 'list' && (
          <Stack gap="md" className="device-manager-list-view">
            {/* Header */}
            <Group justify="space-between" align="center">
              <Group gap={6}>
                <Text fw={700} size="lg">
                  裝置清單
                </Text>
                <Tooltip label="在此管理已連接的裝置，可隨時切換開關啟用定位控制席位。" withArrow>
                  <ActionIcon variant="transparent" size="xs" color="gray">
                    <IconHelpCircle size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
              <CloseButton onClick={onClose} />
            </Group>

            {/* Subheader: Capacity Capsule + Wireless Direct Navigation */}
            <Group justify="space-between" align="center" className="device-manager-toolbar">
              <div className="device-manager-capacity" aria-label={`已啟用 ${activeCount} 台，共可啟用 ${MAX_CAPACITY} 台`}>
                <IconDevices size={17} stroke={1.8} aria-hidden="true" />
                <span>已啟用</span>
                <strong>{activeCount} / {MAX_CAPACITY}</strong>
              </div>

              <Button
                variant="default"
                color="arcBlue"
                size="xs"
                leftSection={<IconWifi size={16} stroke={1.8} />}
                onClick={() => setView('wireless_direct')}
                className="device-manager-direct-link"
              >
                Wireless Direct
              </Button>
            </Group>

            {/* Device Cards List */}
            {allDevices.length === 0 ? (
              <Paper withBorder p="xl" radius="md" style={{ textAlign: 'center' }}>
                <Text size="sm" c="dimmed">
                  目前尚未偵測到任何裝置。請以 USB 接上手機並於螢幕點擊「信任這台電腦」。
                </Text>
              </Paper>
            ) : (
              <ScrollArea.Autosize mah={320}>
                <Stack gap="xs">
                  {allDevices.map((item) => {
                    const isBusyHiding = normalized(hidingDeviceId || '') === normalized(item.udid)
                    const isBusyRestoring = normalized(restoringDeviceId || '') === normalized(item.udid)
                    const isSwitchBusy = isBusyHiding || isBusyRestoring
                    const state = deviceStates[item.udid] || 'idle'

                    return (
                      <Paper
                        key={item.udid}
                        withBorder
                        p="sm"
                        radius="md"
                        className={`device-manager-card${item.isActive ? ' is-active' : ''}`}
                      >
                        <Group justify="space-between" wrap="nowrap" gap="sm">
                          {/* Left: Device Icon + Details */}
                          <Group gap="sm" wrap="nowrap" className="device-manager-card-main">
                            <span className="device-manager-phone-icon" aria-hidden="true">
                              <IconDeviceMobile size={22} stroke={1.7} />
                            </span>

                            <div className="device-manager-card-details">
                              <Group gap="xs" wrap="nowrap">
                                <Text fw={600} size="sm" className="device-manager-device-name">
                                  {item.name}
                                </Text>
                                <Tooltip label="自訂裝置名稱" withArrow>
                                  <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    size="xs"
                                    onClick={() => rename(item.udid, item.rawName)}
                                  >
                                    <IconPencil size={13} />
                                  </ActionIcon>
                                </Tooltip>
                              </Group>

                              <Group gap={6} mt={2} wrap="nowrap">
                                <Text size="xs" c="dimmed">
                                  {item.model}
                                  {item.ios_version ? ` · iOS ${item.ios_version}` : ''}
                                </Text>

                                {/* Connection Badge */}
                                {item.connection_type === 'usb' && (
                                  <Badge size="xs" variant="light" color="teal" tt="none" className="device-manager-connection-badge" leftSection={<IconUsb size={10} />}>
                                    USB
                                  </Badge>
                                )}
                                {item.connection_type === 'wireless_direct' && (
                                  <Badge size="xs" variant="light" color="arcBlue" tt="none" className="device-manager-connection-badge" leftSection={<IconWifi size={10} />}>
                                    Wireless Direct
                                  </Badge>
                                )}
                                {item.connection_type === 'wifi' && (
                                  <Badge size="xs" variant="light" color="cyan" tt="none" className="device-manager-connection-badge" leftSection={<IconWifi size={10} />}>
                                    Wi-Fi
                                  </Badge>
                                )}
                                {item.status === 'offline' && (
                                  <Badge size="xs" variant="light" color="gray" tt="none" className="device-manager-connection-badge">
                                    未連線
                                  </Badge>
                                )}

                                {/* Simulation State Badge */}
                                {state !== 'idle' && (
                                  <Badge size="xs" variant="filled" color="green">
                                    {stateLabels[state]}
                                  </Badge>
                                )}
                              </Group>

                              {/* Keep this action available for an already paired
                                  USB device. A saved RemotePairing file may exist
                                  even after the phone has invalidated its key. */}
                              {item.device &&
                                item.connection_type === 'usb' &&
                                Number.parseInt(item.ios_version, 10) >= 16 && (
                                  <Button
                                    size="compact-xs"
                                    variant="subtle"
                                    color="blue"
                                    mt={4}
                                    loading={pairingBusyId === item.udid}
                                    onClick={() => void handlePair(item.device!)}
                                  >
                                    {item.direct_paired
                                      ? '刷新無線授權'
                                      : '配對此裝置（啟用 Wi-Fi 連線）'}
                                  </Button>
                                )}
                            </div>
                          </Group>

                          {/* Right: Toggle Switch */}
                          <Group gap="xs" wrap="nowrap">
                            <Switch
                              checked={item.isActive}
                              disabled={isSwitchBusy || item.status === 'offline'}
                              onChange={(e) => void handleToggle(item, e.currentTarget.checked)}
                              size="md"
                              color="arcBlue"
                              aria-label={`切換 ${item.name} 啟用狀態`}
                            />
                          </Group>
                        </Group>
                      </Paper>
                    )
                  })}
                </Stack>
              </ScrollArea.Autosize>
            )}

            {/* Quick Reconnect Section (Matches Competitor Screenshot 5) */}
            {quickReconnect && (
              <Stack gap="xs" mt="xs">
                <Group justify="space-between" align="center">
                  <Group gap={4}>
                    <Text fw={600} size="sm">
                      Wireless Direct - 快速復連
                    </Text>
                    <Tooltip label="歷史已配對的端點，無需接線即可一鍵恢復無線定位連線。" withArrow>
                      <ActionIcon variant="transparent" size="xs" color="gray">
                        <IconHelpCircle size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>

                  <Menu shadow="md" width={140} position="bottom-end">
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray" size="sm">
                        <IconDots size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        color="red"
                        leftSection={<IconTrash size={14} />}
                        onClick={handleClearQuickReconnect}
                      >
                        清除連線紀錄
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>

                <Paper
                  withBorder
                  p="sm"
                  radius="md"
                  className="device-manager-secondary-card"
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap">
                      <ThemeIcon variant="light" color="arcBlue" size="md" radius="md">
                        <IconWifi size={18} stroke={1.8} />
                      </ThemeIcon>
                      <div>
                        <Text fw={600} size="sm">
                          {quickReconnect.endpoint}
                        </Text>
                        <Text size="xs" c="dimmed">
                          歷史連線紀錄： {quickReconnect.name} 於 {quickReconnect.timestamp}
                        </Text>
                      </div>
                    </Group>

                    <Button
                      size="xs"
                      variant="light"
                      color="arcBlue"
                      leftSection={<IconWifi size={14} />}
                      onClick={() =>
                        void executeConnect(quickReconnect.udid || '', quickReconnect.ip, quickReconnect.name, true, quickReconnect.port)
                      }
                    >
                      點擊連線
                    </Button>
                  </Group>
                </Paper>
              </Stack>
            )}

            {/* Footer */}
            <Group justify="flex-end" mt="xs">
              <Button variant="default" onClick={onClose}>
                關閉
              </Button>
            </Group>
          </Stack>
        )}

        {/* VIEW 2: WIRELESS DIRECT ENDPOINTS (Matches Competitor Screenshot 2) */}
        {view === 'wireless_direct' && (
          <Stack gap="md">
            {/* Header with Back Button */}
            <Group justify="space-between" align="center">
              <Group gap="xs">
                <ActionIcon variant="subtle" color="gray" onClick={() => setView('list')}>
                  <IconArrowLeft size={18} />
                </ActionIcon>
                <Text fw={700} size="lg">
                  Wireless Direct
                </Text>
              </Group>
              <CloseButton onClick={onClose} />
            </Group>

            {/* Subheader: Scan status & Refresh */}
            <Group justify="space-between" align="center">
              <Text size="xs" c="dimmed">
                找到以下 IP 端點
              </Text>
              <Group gap={6}>
                {lastScanTime && (
                  <Text size="xs" c="dimmed">
                    最後更新時間: {lastScanTime}
                  </Text>
                )}
                <ActionIcon
                  variant="subtle"
                  size="xs"
                  color="gray"
                  loading={isScanning}
                  onClick={loadEndpoints}
                  title="重新整理端點"
                >
                  <IconRefresh size={14} />
                </ActionIcon>
              </Group>
            </Group>

            {/* Endpoints List */}
            {isScanning && endpoints.length === 0 ? (
              <Stack align="center" justify="center" py="xl" gap="sm">
                <Loader size="md" color="blue" />
                <Text size="xs" c="dimmed">
                  正在搜尋區域網路中的 iPhone 端點...
                </Text>
              </Stack>
            ) : endpoints.length === 0 ? (
              <Paper withBorder p="xl" radius="md" style={{ textAlign: 'center' }}>
                <Text size="sm" c="dimmed">
                  目前在區域網路中未掃描到可用端點。
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  請確認手機與電腦連接至同一 Wi-Fi，且手機螢幕已解鎖。
                </Text>
              </Paper>
            ) : (
              <ScrollArea.Autosize mah={280}>
                <Stack gap="xs">
                  {endpoints.map((ep) => {
                    const isHistory = ep.status === 'history'
                    const matchedDev = ep.udid ? devices.find((d) => epUdidMatch(d.udid, ep.udid)) : undefined
                    const targetName = matchedDev
                      ? deviceNames[normalized(matchedDev.udid)] || matchedDev.name
                      : ep.device_name || 'iPhone'
                    // 線上掃描端點不鎖定特定 UDID，傳送空字串走後端 auto 探測比對真實持有該 IP 的手機；
                    // 歷史卡片才指定特定歷史 UDID
                    const targetUdid = isHistory ? (ep.udid || (matchedDev ? matchedDev.udid : '')) : ''
                    const fallbackBonjour = isHistory

                    const dotColor = isHistory ? '#fd7e14' : '#12b886'
                    const iconColor = isHistory ? 'orange' : 'teal'
                    const historySubtitle = isHistory
                      ? `歷史連線紀錄： ${ep.device_name || targetName || 'iPhone'} 於 ${formatDisplayDate(ep.last_connected)}`
                      : ep.last_connected
                      ? `上次連線: ${formatDisplayDate(ep.last_connected)}`
                      : null

                    return (
                      <Paper key={ep.endpoint} withBorder p="sm" radius="md" className="device-manager-secondary-card">
                        <Group justify="space-between" wrap="nowrap">
                          <Group gap="sm" wrap="nowrap">
                            <ThemeIcon variant="light" color={iconColor} size="md" radius="xl">
                              <span
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  backgroundColor: dotColor,
                                  display: 'inline-block',
                                }}
                              />
                            </ThemeIcon>
                            <div>
                              <Text fw={600} size="sm">
                                {ep.endpoint}
                              </Text>
                              {historySubtitle && (
                                <Text size="xs" c="dimmed">
                                  {historySubtitle}
                                </Text>
                              )}
                            </div>
                          </Group>

                          <Button
                            size="xs"
                            variant="light"
                            color="arcBlue"
                            leftSection={<IconWifi size={14} />}
                            onClick={() => void executeConnect(targetUdid, ep.ip, targetName, fallbackBonjour, ep.port)}
                          >
                            點擊連線
                          </Button>
                        </Group>
                      </Paper>
                    )
                  })}
                </Stack>
              </ScrollArea.Autosize>
            )}

            {/* Manual IP Collapsible (Fallback for restrictive LANs) */}
            <div>
              <Button
                variant="subtle"
                size="compact-xs"
                color="gray"
                onClick={() => setManualIpOpen((prev) => !prev)}
              >
                {manualIpOpen ? '收合手動輸入' : '進階：手動輸入 IP 位址'}
              </Button>
              <Collapse in={manualIpOpen}>
                <Paper withBorder p="sm" radius="md" mt="xs">
                  <Stack gap="xs">
                    <Group gap="xs" grow>
                      <Select
                        size="xs"
                        label="目標裝置"
                        placeholder="選擇裝置或自動偵測"
                        data={manualTargetOptions}
                        value={manualTargetUdid}
                        onChange={(val) => setManualTargetUdid(val || '')}
                      />
                      <TextInput
                        size="xs"
                        label="手機 IP 位址"
                        placeholder="192.168.1.105"
                        value={manualIpDraft}
                        onChange={(e) => setManualIpDraft(e.currentTarget.value)}
                      />
                    </Group>
                    <Group justify="flex-end">
                      <Button
                        size="xs"
                        color="blue"
                        disabled={!manualIpDraft.trim()}
                        onClick={() => {
                          const targetDev = allDevices.find((d) => d.udid === manualTargetUdid)
                          const targetName = targetDev ? targetDev.name : '已配對裝置'
                          void executeConnect(manualTargetUdid, manualIpDraft.trim(), targetName, false)
                        }}
                      >
                        連線
                      </Button>
                    </Group>
                  </Stack>
                </Paper>
              </Collapse>
            </div>

            {/* Footer */}
            <Group justify="flex-end" mt="xs">
              <Button variant="default" onClick={() => setView('list')}>
                返回裝置清單
              </Button>
            </Group>
          </Stack>
        )}

        {/* VIEW 3: CONNECTING TRANSITION (Matches Competitor Screenshot 3) */}
        {view === 'connecting' && (
          <Stack gap="md">
            {/* Header with Back Button */}
            <Group justify="space-between" align="center">
              <Group gap="xs">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={() => setView('wireless_direct')}
                >
                  <IconArrowLeft size={18} />
                </ActionIcon>
                <Text fw={700} size="lg">
                  Wireless Direct
                </Text>
              </Group>
              <CloseButton onClick={onClose} />
            </Group>

            {/* Center Loading or Error State */}
            <Stack align="center" justify="center" py="xl" gap="md" style={{ minHeight: 260 }}>
              {connectingState.status === 'loading' ? (
                <>
                  <Loader size="xl" type="oval" color="blue" />
                  <Stack align="center" gap={4} mt="sm">
                    <Text fw={600} size="md">
                      正在驗證 WiFi Remote Pairing 信任...
                    </Text>
                    <Text size="xs" c="dimmed" ta="center" maw={360}>
                      這一步會確認這台 iPhone 是否已允許此電腦透過 WiFi 建立模擬定位通道。
                    </Text>
                  </Stack>
                </>
              ) : (
                <>
                  <ThemeIcon color="red" variant="light" size={48} radius="xl">
                    <IconAlertCircle size={28} />
                  </ThemeIcon>
                  <Stack align="center" gap={4}>
                    <Text fw={600} size="md" c="red">
                      連線建立失敗
                    </Text>
                    <Text size="xs" c="dimmed" ta="center" maw={360}>
                      {connectingState.errorMessage || '請確認手機已在同一 Wi-Fi，且已解鎖並信任此電腦。'}
                    </Text>
                  </Stack>

                  <Group mt="md">
                    <Button variant="default" onClick={() => setView('wireless_direct')}>
                      返回端點清單
                    </Button>
                    <Button
                      color="blue"
                      onClick={() =>
                        void executeConnect(
                          connectingState.targetUdid,
                          connectingState.targetIp,
                          connectingState.targetName,
                          connectingState.fallbackBonjour
                        )
                      }
                    >
                      重新連線
                    </Button>
                  </Group>
                </>
              )}
            </Stack>
          </Stack>
        )}
      </Modal>

      {/* RENAME CUSTOM NAME MODAL */}
      <Modal
        opened={Boolean(renamingDevice)}
        onClose={cancelRename}
        title="編輯自訂名稱"
        centered
        size="sm"
        zIndex={2300}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            此名稱只會用於這台電腦；留白即可恢復系統名稱。
          </Text>
          <TextInput
            label="自訂裝置名稱"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.currentTarget.value)}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter') saveName()
            }}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={cancelRename}>
              取消
            </Button>
            <Button onClick={saveName}>確定</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

function epUdidMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}
