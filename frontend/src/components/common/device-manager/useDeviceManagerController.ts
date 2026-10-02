import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  amfiRevealDeveloperMode,
  clearQuickReconnectRecord,
  clearWirelessDirectAddress,
  connectWirelessDirect,
  getQuickReconnectRecords,
  getWirelessDirectEndpoints,
  pairWirelessDirect,
  saveQuickReconnectRecord,
  trustDeviceForSetup,
  type Device,
  type QuickReconnectRecord,
  type WirelessDirectEndpoint,
} from '../../../services/api'
import type { HiddenDevice } from '../../../hooks/useHiddenDevices'
import { showToast } from '../Toast'
import type { DeviceManagerController, DirectConnectRequest, ManagedDevice } from './types'

export const DEVICE_MANAGER_CAPACITY = 3

export function normalizeDeviceId(udid: string) {
  return udid.trim().toLowerCase()
}

function currentTimestamp() {
  const d = new Date()
  const date = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
  return `${date} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type Options = {
  isOpen: boolean
  devices: Device[]
  hiddenDevices: HiddenDevice[]
  hiddenUdids?: readonly string[] | ReadonlySet<string>
  usableDeviceIds?: readonly string[] | ReadonlySet<string>
  deviceNames: Record<string, string>
  onHideDevice: (device: Device) => void | Promise<void>
  onUnhideDevice: (udid: string) => void
  onRefreshDevices?: (minimumRevision?: number) => void | Promise<void>
}

export function useDeviceManagerController(options: Options): DeviceManagerController {
  const [view, setView] = useState<DeviceManagerController['view']>('list')
  const [endpoints, setEndpoints] = useState<WirelessDirectEndpoint[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [lastScanTime, setLastScanTime] = useState('')
  const [quickReconnects, setQuickReconnects] = useState<QuickReconnectRecord[]>([])
  const [setupState, setSetupState] = useState<DeviceManagerController['setupState']>(null)
  const [setupSawUsbDisconnect, setSetupSawUsbDisconnect] = useState(false)
  const [connectingState, setConnectingState] = useState<DeviceManagerController['connectingState']>({
    status: 'loading', targetUdid: '', targetName: '', fallbackBonjour: true, port: 0,
  })

  useEffect(() => {
    if (!options.isOpen) return
    setView('list')
    setSetupState(null)
    setSetupSawUsbDisconnect(false)
    setQuickReconnects(getQuickReconnectRecords())
  }, [options.isOpen])

  const hiddenKeys = useMemo(() => {
    const result = new Set(options.hiddenDevices.map((item) => normalizeDeviceId(item.udid)))
    if (options.hiddenUdids) for (const id of options.hiddenUdids) result.add(normalizeDeviceId(id))
    return result
  }, [options.hiddenDevices, options.hiddenUdids])

  const usableKeys = useMemo(
    () => options.usableDeviceIds ? new Set([...options.usableDeviceIds].map(normalizeDeviceId)) : null,
    [options.usableDeviceIds],
  )

  const allDevices = useMemo<ManagedDevice[]>(() => options.devices.map((device) => {
    const key = normalizeDeviceId(device.udid)
    const rawName = device.name.toLowerCase() === device.udid.toLowerCase()
      ? device.udid.slice(-8).toUpperCase()
      : device.name
    return {
      udid: device.udid,
      name: options.deviceNames[key] || rawName,
      rawName,
      model: 'iPhone',
      ios_version: device.ios_version || '',
      connection_type: device.connection_type,
      status: device.status,
      direct_paired: device.direct_paired,
      trusted: device.trusted,
      device,
      isActive: !hiddenKeys.has(key) && (!usableKeys || usableKeys.has(key)),
    }
  }), [options.devices, options.deviceNames, hiddenKeys, usableKeys])

  const activeCount = useMemo(() => allDevices.filter((item) => item.isActive).length, [allDevices])

  const beginSetup = useCallback((device: ManagedDevice) => {
    setSetupSawUsbDisconnect(false)
    setSetupState({ step: 'unlock', device })
    setView('setup')
  }, [])

  const authorizeWifi = useCallback(async (device: ManagedDevice) => {
    if (!device.device) return
    setSetupState({ step: 'authorizing_wifi', device })
    try {
      const result = await pairWirelessDirect(device.udid)
      await options.onRefreshDevices?.(result.revision)
      setSetupState({ step: 'complete', device })
      showToast('已完成一般 Wi-Fi 連線授權。拔線後將自動尋找這台 iPhone。')
    } catch (error) {
      setSetupState({
        step: 'error', device, retryTarget: 'trust',
        errorMessage: error instanceof Error ? error.message : '無法完成 Wi-Fi 連線授權，請保持 USB 連線後重試。',
      })
    }
  }, [options.onRefreshDevices])

  const requestTrust = useCallback(async () => {
    const device = setupState?.device
    if (!device) return
    setSetupState({ step: 'requesting_trust', device })
    try {
      const result = await trustDeviceForSetup(device.udid)
      await options.onRefreshDevices?.(result.revision)
      if (result.developer_mode_required && !result.developer_mode_enabled) {
        setSetupState({ step: 'developer_mode', device })
        return
      }
      await authorizeWifi(device)
    } catch (error) {
      setSetupState({
        step: 'error', device, retryTarget: 'trust',
        errorMessage: error instanceof Error ? error.message : '無法確認 iPhone 的信任狀態，請解鎖手機後重試。',
      })
    }
  }, [authorizeWifi, options.onRefreshDevices, setupState?.device])

  useEffect(() => {
    if (setupState?.step !== 'waiting_for_developer_mode') return
    const target = normalizeDeviceId(setupState.device.udid)
    const usbPresent = options.devices.some(
      (device) => normalizeDeviceId(device.udid) === target && device.connection_type === 'usb',
    )
    if (!usbPresent) {
      setSetupSawUsbDisconnect(true)
      return
    }
    if (setupSawUsbDisconnect) {
      setSetupSawUsbDisconnect(false)
      void requestTrust()
    }
  }, [options.devices, requestTrust, setupSawUsbDisconnect, setupState])

  const revealDeveloperMode = useCallback(async () => {
    const device = setupState?.device
    if (!device) return
    setSetupState({ step: 'revealing_developer_mode', device })
    try {
      await amfiRevealDeveloperMode(device.udid)
      setSetupState({ step: 'waiting_for_developer_mode', device })
    } catch (error) {
      setSetupState({
        step: 'error', device, retryTarget: 'reveal',
        errorMessage: error instanceof Error ? error.message : '暫時無法顯示開發者模式選項，請保持 USB 連線後重試。',
      })
    }
  }, [setupState?.device])

  const returnToSetupList = useCallback(() => {
    setSetupSawUsbDisconnect(false)
    setSetupState(null)
    setView('list')
  }, [])

  const loadEndpoints = useCallback(async () => {
    setIsScanning(true)
    try {
      setEndpoints(await getWirelessDirectEndpoints())
      setLastScanTime(new Date().toTimeString().split(' ')[0])
    } catch {
      // Endpoint discovery is best effort. Keep the last successful list so a
      // transient Bonjour/ARP failure does not erase usable reconnect targets.
    } finally {
      setIsScanning(false)
    }
  }, [])

  useEffect(() => {
    if (view === 'wireless_direct') void loadEndpoints()
  }, [view, loadEndpoints])

  const executeConnect = useCallback(async (request: DirectConnectRequest) => {
    // Copy only command fields. The retry source is the previous UI state and
    // may still contain `status: error`; spreading it would immediately undo
    // the loading transition and make the retry appear to do nothing.
    const command: DirectConnectRequest = {
      targetUdid: request.targetUdid,
      targetIp: request.targetIp,
      targetName: request.targetName,
      fallbackBonjour: request.fallbackBonjour,
      port: request.port,
      refreshPairing: request.refreshPairing,
    }
    setConnectingState({ status: 'loading', ...command })
    setView('connecting')
    try {
      const connected = await connectWirelessDirect(
        command.targetUdid, command.targetIp, command.fallbackBonjour, command.port, command.refreshPairing,
      )
      const udid = command.targetUdid || connected.udid
      const name = command.targetName || connected.name || 'iPhone'
      const ip = connected.ip_address || command.targetIp || ''
      const record: QuickReconnectRecord = {
        udid, name, ip, port: command.port,
        endpoint: ip ? `${ip.includes(':') ? `[${ip}]` : ip}:${command.port}` : String(command.port),
        timestamp: currentTimestamp(),
      }
      setQuickReconnects(saveQuickReconnectRecord(record))
      if (allDevices.some((item) => item.udid === udid && item.isActive) || activeCount < DEVICE_MANAGER_CAPACITY) {
        options.onUnhideDevice(udid)
        showToast(`Wireless Direct 已連線並啟用「${name}」`)
      } else {
        showToast(`Wireless Direct 已連線至「${name}」（席位已滿 3 台，請先在清單關閉其他裝置後再啟用）`)
      }
      // The command revision prevents a scan started before this connect from
      // replacing the newly selected Wireless Direct route.
      await options.onRefreshDevices?.(connected.revision)
      setView('list')
    } catch (error) {
      await options.onRefreshDevices?.()
      setConnectingState((current) => ({
        ...current,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : '連線失敗，請檢查手機 Wi-Fi 與配對狀態。',
      }))
    }
  }, [activeCount, allDevices, options.onRefreshDevices, options.onUnhideDevice])

  const retryConnect = useCallback(() => executeConnect({
    targetUdid: connectingState.targetUdid,
    targetIp: connectingState.targetIp,
    targetName: connectingState.targetName,
    fallbackBonjour: connectingState.fallbackBonjour,
    port: connectingState.port,
    // A transient network retry must not require a cable or rewrite pairing.
    refreshPairing: false,
  }), [connectingState, executeConnect])

  const repairAuthorization = useCallback(() => executeConnect({
    targetUdid: connectingState.targetUdid,
    targetIp: connectingState.targetIp,
    targetName: connectingState.targetName,
    fallbackBonjour: connectingState.fallbackBonjour,
    port: connectingState.port,
    // USB repair is explicit because it validates and refreshes the selected
    // phone's authorization before reconnecting the same endpoint.
    refreshPairing: true,
  }), [connectingState, executeConnect])

  const handleToggle = useCallback(async (item: ManagedDevice, checked: boolean) => {
    if (checked) {
      if (activeCount >= DEVICE_MANAGER_CAPACITY) {
        showToast(`已達最大同時控制數量（${DEVICE_MANAGER_CAPACITY} 台），請先關閉其他裝置。`)
        return
      }
      options.onUnhideDevice(item.udid)
      showToast(`已啟用裝置「${item.name}」`)
      await options.onRefreshDevices?.()
    } else if (item.device) {
      await options.onHideDevice(item.device)
    }
  }, [activeCount, options.onHideDevice, options.onRefreshDevices, options.onUnhideDevice])

  const clearQuickReconnects = useCallback(async () => {
    try {
      const ids = [...new Set(quickReconnects.map((item) => item.udid).filter(Boolean))] as string[]
      await Promise.all(ids.map(clearWirelessDirectAddress))
    } catch (error) {
      showToast(error instanceof Error ? error.message : '清除後端連線紀錄失敗，請稍後重試。')
      return
    }
    clearQuickReconnectRecord()
    setQuickReconnects([])
    showToast('已清除快速復連歷史紀錄')
  }, [quickReconnects])

  return { view, setView, allDevices, activeCount, endpoints, isScanning, lastScanTime,
    quickReconnects, setupState, connectingState, loadEndpoints, executeConnect, retryConnect, repairAuthorization,
    handleToggle, beginSetup, requestTrust, revealDeveloperMode, returnToSetupList, clearQuickReconnects }
}
