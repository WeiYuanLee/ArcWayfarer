import type { Device, QuickReconnectRecord, WirelessDirectEndpoint } from '../../../services/api'

export type DeviceManagerView = 'list' | 'wireless_direct' | 'connecting' | 'setup'

export type ManagedDevice = {
  udid: string
  name: string
  rawName: string
  model: string
  ios_version: string
  connection_type: Device['connection_type']
  status: Device['status']
  direct_paired?: boolean
  trusted?: boolean | null
  device?: Device
  isActive: boolean
}

export type DeviceSetupStep =
  | 'unlock'
  | 'requesting_trust'
  | 'developer_mode'
  | 'revealing_developer_mode'
  | 'waiting_for_developer_mode'
  | 'authorizing_wifi'
  | 'complete'
  | 'error'

export type DeviceSetupState = {
  step: DeviceSetupStep
  device: ManagedDevice
  errorMessage?: string
  retryTarget?: 'trust' | 'reveal' | 'check'
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
  setupState: DeviceSetupState | null
  connectingState: DirectConnectionState
  loadEndpoints: () => Promise<void>
  executeConnect: (request: DirectConnectRequest) => Promise<void>
  retryConnect: () => Promise<void>
  repairAuthorization: () => Promise<void>
  handleToggle: (item: ManagedDevice, checked: boolean) => Promise<void>
  beginSetup: (device: ManagedDevice) => void
  requestTrust: () => Promise<void>
  revealDeveloperMode: () => Promise<void>
  returnToSetupList: () => void
  clearQuickReconnects: () => Promise<void>
}
