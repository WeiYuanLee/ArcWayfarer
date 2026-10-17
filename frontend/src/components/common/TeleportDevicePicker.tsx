import { NativeSelect } from '@mantine/core'
import { IconDeviceMobile } from '@tabler/icons-react'
import { useT } from '../../i18n'
import type { Device } from '../../services/api'

export type TeleportDeviceOption = {
  value: string
  label: string
}

export type TeleportDeviceSelection = {
  teleportDevices: TeleportDeviceOption[]
  teleportDeviceId: string | null
  onTeleportDeviceChange: (deviceId: string) => void
}

export function getAvailableTeleportDeviceOptions(
  devices: Device[],
  isBusy: (deviceId: string) => boolean,
): TeleportDeviceOption[] {
  return devices
    .filter((device) => device.status === 'ready' && !isBusy(device.udid))
    .map((device) => ({ value: device.udid, label: device.name }))
}

export function TeleportDevicePicker({ teleportDevices, teleportDeviceId, onTeleportDeviceChange }: TeleportDeviceSelection) {
  const t = useT()
  const data = teleportDevices.length > 0
    ? teleportDevices.map((device) => ({
      value: device.value,
      label: `${t('favorites.teleport_device')}：${device.label}`,
    }))
    : [{ value: '', label: t('favorites.no_available_device'), disabled: true }]

  return (
    <NativeSelect
      className="teleport-device-picker"
      size="xs"
      value={teleportDeviceId ?? ''}
      data={data}
      aria-label={t('favorites.teleport_device')}
      leftSection={<IconDeviceMobile size={14} stroke={1.8} />}
      disabled={teleportDevices.length === 0}
      onChange={(event) => { if (event.currentTarget.value) onTeleportDeviceChange(event.currentTarget.value) }}
    />
  )
}
