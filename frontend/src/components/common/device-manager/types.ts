import type { Device, QuickReconnectRecord, WirelessDirectEndpoint } from '../../../services/api'

export type DeviceManagerView = 'list' | 'wireless_direct' | 'connecting'

export type ManagedDevice = {
  udid: string
  name: string
  rawName: string
  model: string
  ios_version: string
  connection_type: Device['connection_type']
  status: Device['status']
  direct_paired?: boolean
  device?: Device
  isActive: boolean
}

export type DirectConnectionState = {
  status: 'loading' | 'error'
  targetUdid: string
  targetIp?: string
  targetName: string
  fallbackBonjour: boolean
  port: number
  errorMessage?: string
}

export type DirectConnectRequest = Omit<DirectConnectionState, 'status' | 'errorMessage'>
  & { refreshPairing?: boolean }

export type DeviceManagerController = {
  view: DeviceManagerView
  setView: (view: DeviceManagerView) => void
  allDevices: ManagedDevice[]
  activeCount: number
  endpoints: WirelessDirectEndpoint[]
  isScanning: boolean
  lastScanTime: string
  quickReconnects: QuickReconnectRecord[]
  pairingBusyId: string | null
  connectingState: DirectConnectionState
  loadEndpoints: () => Promise<void>
  executeConnect: (request: DirectConnectRequest) => Promise<void>
  retryConnect: () => Promise<void>
  handleToggle: (item: ManagedDevice, checked: boolean) => Promise<void>
  handlePair: (device: Device) => Promise<void>
  clearQuickReconnects: () => Promise<void>
}
