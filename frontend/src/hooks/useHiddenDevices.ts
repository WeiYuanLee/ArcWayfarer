import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Device } from '../services/api'

export const HIDDEN_DEVICES_STORAGE_KEY = 'arcwayfarer.hidden-devices.v1'

/**
 * A deliberately small local record. It lets the device manager identify a
 * hidden phone even while it is disconnected from the next discovery scan.
 */
export type HiddenDevice = {
  udid: string
  name: string
  hiddenAt: number
  iosVersion?: string
  connectionType?: Device['connection_type']
}

type HideableDevice = Pick<Device, 'udid' | 'name' | 'ios_version' | 'connection_type'>

function normalizeUdid(udid: string) {
  return udid.trim().toLowerCase()
}

function parseStoredHiddenDevices(value: string | null): HiddenDevice[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []

    const byUdid = new Map<string, HiddenDevice>()
    for (const item of parsed) {
      // Accept the early string-only form too, so this preference survives an
      // upgrade from a pre-release build.
      const rawUdid = typeof item === 'string' ? item : typeof item === 'object' && item !== null && 'udid' in item && typeof item.udid === 'string' ? item.udid : ''
      const udid = rawUdid.trim()
      if (!udid) continue
      const rawName = typeof item === 'object' && item !== null && 'name' in item && typeof item.name === 'string' ? item.name.trim() : ''
      const rawHiddenAt = typeof item === 'object' && item !== null && 'hiddenAt' in item && typeof item.hiddenAt === 'number' ? item.hiddenAt : 0
      const rawIosVersion = typeof item === 'object' && item !== null && 'iosVersion' in item && typeof item.iosVersion === 'string' ? item.iosVersion : undefined
      const rawConnectionType = typeof item === 'object' && item !== null && 'connectionType' in item && (item.connectionType === 'usb' || item.connectionType === 'wifi' || item.connectionType === 'unknown') ? item.connectionType : undefined
      byUdid.set(normalizeUdid(udid), { udid, name: rawName || udid.slice(-8), hiddenAt: rawHiddenAt, iosVersion: rawIosVersion, connectionType: rawConnectionType })
    }
    return [...byUdid.values()]
  } catch {
    return []
  }
}

/** Persists the UI-only device visibility preference on this computer. */
export function useHiddenDevices() {
  const [hiddenDevices, setHiddenDevices] = useState<HiddenDevice[]>(() => {
    if (typeof window === 'undefined') return []
    return parseStoredHiddenDevices(window.localStorage.getItem(HIDDEN_DEVICES_STORAGE_KEY))
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(HIDDEN_DEVICES_STORAGE_KEY, JSON.stringify(hiddenDevices))
    } catch (error) {
      // A full or unavailable localStorage must not make the device UI fail.
      console.warn('Failed to save hidden devices:', error)
    }
  }, [hiddenDevices])

  const hiddenUdids = useMemo(() => new Set(hiddenDevices.map((device) => normalizeUdid(device.udid))), [hiddenDevices])

  const isHidden = useCallback((udid: string) => hiddenUdids.has(normalizeUdid(udid)), [hiddenUdids])

  const hideDevice = useCallback((device: HideableDevice) => {
    setHiddenDevices((current) => {
      const key = normalizeUdid(device.udid)
      const record: HiddenDevice = {
        udid: device.udid,
        name: device.name && normalizeUdid(device.name) !== key ? device.name : device.udid.slice(-8),
        hiddenAt: Date.now(),
        iosVersion: device.ios_version,
        connectionType: device.connection_type,
      }
      const existingIndex = current.findIndex((item) => normalizeUdid(item.udid) === key)
      if (existingIndex < 0) return [...current, record]
      const next = [...current]
      next[existingIndex] = { ...current[existingIndex], ...record, hiddenAt: current[existingIndex].hiddenAt || record.hiddenAt }
      return next
    })
  }, [])

  const unhideDevice = useCallback((udid: string) => {
    const key = normalizeUdid(udid)
    setHiddenDevices((current) => current.filter((device) => normalizeUdid(device.udid) !== key))
  }, [])

  return { hiddenDevices, hiddenUdids, isHidden, hideDevice, unhideDevice }
}
