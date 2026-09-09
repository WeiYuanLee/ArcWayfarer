import { useEffect, useMemo, useState } from 'react'
import type { Device } from '../services/api'

export const DEVICE_SLOTS_STORAGE_KEY = 'arcwayfarer.device-slots.v1'

export function normalizeDeviceId(udid: string) {
  return udid.trim().toLowerCase()
}

function readStoredSlots(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(DEVICE_SLOTS_STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map(normalizeDeviceId) : []
  } catch {
    return []
  }
}

export function reconcileDeviceSlots(
  devices: Device[],
  previousSlotIds: readonly string[],
  hiddenIds: ReadonlySet<string>,
  activeIds: ReadonlySet<string>,
  maxSlots: number,
): string[] {
  return reconcileDeviceOrder(devices, previousSlotIds, hiddenIds, activeIds).slice(0, maxSlots)
}

function reconcileDeviceOrder(
  devices: Device[],
  previousOrderIds: readonly string[],
  hiddenIds: ReadonlySet<string>,
  activeIds: ReadonlySet<string>,
): string[] {
  const candidates = new Map(
    devices
      .map((device) => [normalizeDeviceId(device.udid), device] as const)
      .filter(([id]) => !hiddenIds.has(id)),
  )
  const previous = previousOrderIds.map(normalizeDeviceId).filter((id, index, all) => candidates.has(id) && all.indexOf(id) === index)
  const discovered = [...candidates.keys()]
  const active = [...new Set([...previous, ...discovered].filter((id) => activeIds.has(id)))]
  const stable = previous.filter((id) => !activeIds.has(id))
  const newcomers = discovered.filter((id) => !activeIds.has(id) && !stable.includes(id))
  return [...active, ...stable, ...newcomers]
}

/** Keeps operational device admission stable across discovery reordering. */
export function useStableDeviceSlots(
  devices: Device[],
  hiddenIds: ReadonlySet<string>,
  activeIds: ReadonlySet<string>,
  maxSlots: number,
) {
  const [deviceOrderIds, setDeviceOrderIds] = useState<string[]>(readStoredSlots)
  const reconciledOrder = useMemo(
    () => reconcileDeviceOrder(devices, deviceOrderIds, hiddenIds, activeIds),
    [activeIds, devices, deviceOrderIds, hiddenIds],
  )

  useEffect(() => {
    if (deviceOrderIds.length === reconciledOrder.length && deviceOrderIds.every((id, index) => id === reconciledOrder[index])) return
    setDeviceOrderIds(reconciledOrder)
    try {
      window.localStorage.setItem(DEVICE_SLOTS_STORAGE_KEY, JSON.stringify(reconciledOrder))
    } catch {
      // Stable admission still works for this renderer session.
    }
  }, [deviceOrderIds, reconciledOrder])

  const byId = new Map(devices.map((device) => [normalizeDeviceId(device.udid), device]))
  return reconciledOrder.slice(0, maxSlots).map((id) => byId.get(id)).filter((device): device is Device => Boolean(device))
}
