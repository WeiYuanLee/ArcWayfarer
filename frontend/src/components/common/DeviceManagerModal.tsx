import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import type { Device } from '../../services/api'
import type { HiddenDevice } from '../../hooks/useHiddenDevices'
import type { DeviceState } from '../panels/types'
import { DeviceListView } from './device-manager/DeviceListView'
import { DirectConnectionFlow } from './device-manager/DirectConnectionFlow'
import { WirelessDirectView } from './device-manager/WirelessDirectView'
import { normalizeDeviceId, useDeviceManagerController } from './device-manager/useDeviceManagerController'
import type { ManagedDevice } from './device-manager/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  devices: Device[]
  hiddenDevices?: HiddenDevice[]
  hiddenUdids?: readonly string[] | ReadonlySet<string>
  usableDeviceIds?: readonly string[] | ReadonlySet<string>
  deviceNames: Record<string, string>
  deviceStates: Record<string, DeviceState>
  hidingDeviceId?: string | null
  restoringDeviceId?: string | null
  onHideDevice: (device: Device) => void | Promise<void>
  onUnhideDevice: (udid: string) => void
  onRestoreDevice?: (udid: string) => void | Promise<void>
  onSetDeviceName: (udid: string, name: string) => void
  onRefreshDevices?: (minimumRevision?: number) => void | Promise<void>
  isUnhideDisabled?: (udid: string) => boolean
  unhideDisabledReason?: (udid: string) => string | undefined
}

export function DeviceManagerModal(props: Props) {
  const controller = useDeviceManagerController({
    isOpen: props.isOpen,
    devices: props.devices,
    hiddenDevices: props.hiddenDevices ?? [],
    hiddenUdids: props.hiddenUdids,
    usableDeviceIds: props.usableDeviceIds,
    deviceNames: props.deviceNames,
    onHideDevice: props.onHideDevice,
    onUnhideDevice: props.onUnhideDevice,
    onRefreshDevices: props.onRefreshDevices,
  })
  const [renaming, setRenaming] = useState<{ udid: string; fallbackName: string } | null>(null)
  const [nameDraft, setNameDraft] = useState('')

  const beginRename = (device: ManagedDevice) => {
    setRenaming({ udid: device.udid, fallbackName: device.rawName })
    setNameDraft(props.deviceNames[normalizeDeviceId(device.udid)] || device.rawName)
  }
  const cancelRename = () => setRenaming(null)
  const saveName = () => {
    if (!renaming) return
    const value = nameDraft.trim()
    props.onSetDeviceName(renaming.udid, !value || value === renaming.fallbackName ? '' : value)
    cancelRename()
  }

  return <>
    <Modal opened={props.isOpen} onClose={props.onClose} withCloseButton={false} centered size="lg" zIndex={2100} padding="lg" radius="lg" classNames={{ content: 'device-manager-modal', body: 'device-manager-modal-body' }}>
      {controller.view === 'list' && <DeviceListView
        devices={controller.allDevices} activeCount={controller.activeCount} deviceStates={props.deviceStates}
        hidingDeviceId={props.hidingDeviceId} restoringDeviceId={props.restoringDeviceId}
        pairingBusyId={controller.pairingBusyId} quickReconnects={controller.quickReconnects}
        onClose={props.onClose} onOpenDirect={() => controller.setView('wireless_direct')} onRename={beginRename}
        onToggle={(device, checked) => void controller.handleToggle(device, checked)}
        onPair={(device) => { if (device.device) void controller.handlePair(device.device) }}
        onQuickConnect={(request) => void controller.executeConnect(request)}
        onClearQuickReconnects={() => void controller.clearQuickReconnects()}
      />}
      {controller.view === 'wireless_direct' && <WirelessDirectView
        endpoints={controller.endpoints} devices={props.devices} managedDevices={controller.allDevices}
        deviceNames={props.deviceNames} isScanning={controller.isScanning} lastScanTime={controller.lastScanTime}
        onBack={() => controller.setView('list')} onClose={props.onClose}
        onRefresh={() => void controller.loadEndpoints()} onConnect={(request) => void controller.executeConnect(request)}
      />}
      {controller.view === 'connecting' && <DirectConnectionFlow
        state={controller.connectingState} onBack={() => controller.setView('wireless_direct')} onClose={props.onClose}
        onRetry={() => void controller.retryConnect()}
      />}
    </Modal>
    <Modal opened={Boolean(renaming)} onClose={cancelRename} title="編輯自訂名稱" centered size="sm" zIndex={2300}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">此名稱只會用於這台電腦；留白即可恢復系統名稱。</Text>
        <TextInput label="自訂裝置名稱" value={nameDraft} onChange={(event) => setNameDraft(event.currentTarget.value)} autoFocus onKeyDown={(event) => { if (event.key === 'Enter') saveName() }} />
        <Group justify="flex-end"><Button variant="default" onClick={cancelRename}>取消</Button><Button onClick={saveName}>確定</Button></Group>
      </Stack>
    </Modal>
  </>
}
