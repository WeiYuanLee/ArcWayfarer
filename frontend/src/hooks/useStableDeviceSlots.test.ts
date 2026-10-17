import { describe, expect, it } from 'vitest'
import type { Device } from '../services/api'
import { includeKnownActiveDevices, mergeDiscoveredAndRetainedDevices, reconcileDeviceSlots } from './useStableDeviceSlots'

const devices = ['A', 'B', 'C', 'D'].map((udid) => ({
  udid, name: udid, ios_version: '18.0', transport: 'rsd', connection_type: 'usb', status: 'ready',
} as Device))

describe('reconcileDeviceSlots', () => {
  it('does not let discovery order replace admitted devices', () => {
    expect(reconcileDeviceSlots([...devices].reverse(), ['b', 'c', 'd'], new Set(['a']), new Set(), 3)).toEqual(['b', 'c', 'd'])
  })

  it('pins active devices ahead of idle devices', () => {
    expect(reconcileDeviceSlots(devices, ['a', 'b', 'c'], new Set(), new Set(['b', 'c', 'd']), 3)).toEqual(['b', 'c', 'd'])
  })

  it('keeps a hidden device out regardless of casing', () => {
    expect(reconcileDeviceSlots(devices, ['a', 'b', 'c'], new Set(['a']), new Set(), 3)).toEqual(['b', 'c', 'd'])
  })

  it('uses the prior queue order when a slot becomes available', () => {
    expect(reconcileDeviceSlots([...devices].reverse(), ['b', 'c', 'd', 'a'], new Set(['b']), new Set(), 3)).toEqual(['c', 'd', 'a'])
  })

  it('retains a known active device through a transient discovery omission', () => {
    const known = new Map(devices.map((device) => [device.udid.toLowerCase(), device]))
    expect(includeKnownActiveDevices([devices[1]], known, new Set(['a']))).toEqual([devices[1], devices[0]])
  })

  it('adds a background-running device to the device manager without duplicating discovered devices', () => {
    expect(mergeDiscoveredAndRetainedDevices(
      [devices[1]],
      [devices[0], devices[1]],
    )).toEqual([devices[1], devices[0]])
  })
})
