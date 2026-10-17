import { describe, expect, it } from 'vitest'
import type { Device } from '../../services/api'
import { getAvailableTeleportDeviceOptions } from './TeleportDevicePicker'

function device(udid: string, name: string, status: Device['status'] = 'ready'): Device {
  return {
    udid,
    name,
    status,
    ios_version: '18.0',
    transport: 'lockdown',
    connection_type: 'usb',
    detail: null,
  }
}

describe('getAvailableTeleportDeviceOptions', () => {
  it('only returns ready devices that are not busy', () => {
    const devices = [device('device-a', 'A'), device('device-b', 'B'), device('device-c', 'C')]

    expect(getAvailableTeleportDeviceOptions(devices, (deviceId) => deviceId === 'device-a')).toEqual([
      { value: 'device-b', label: 'B' },
      { value: 'device-c', label: 'C' },
    ])
  })

  it('also excludes connected devices that are not ready', () => {
    const devices = [device('ready', 'Ready'), device('mounting', 'Mounting', 'mounting')]

    expect(getAvailableTeleportDeviceOptions(devices, () => false)).toEqual([
      { value: 'ready', label: 'Ready' },
    ])
  })
})
