import { useCallback, useEffect, useState } from 'react'

export const DEVICE_NAMES_STORAGE_KEY = 'arcwayfarer.device-names.v1'

function normalizeUdid(udid: string) {
  return udid.trim().toLowerCase()
}

function readNames(value: string | null): Record<string, string> {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([udid, name]) => {
        const normalizedUdid = normalizeUdid(udid)
        const normalizedName = typeof name === 'string' ? name.trim() : ''
        return normalizedUdid && normalizedName ? [[normalizedUdid, normalizedName]] : []
      })
    )
  } catch {
    return {}
  }
}

/** Stores local display names independently from device discovery and hiding. */
export function useDeviceNames() {
  const [deviceNames, setDeviceNames] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {}
    return readNames(window.localStorage.getItem(DEVICE_NAMES_STORAGE_KEY))
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(DEVICE_NAMES_STORAGE_KEY, JSON.stringify(deviceNames))
    } catch (error) {
      console.warn('Failed to save device names:', error)
    }
  }, [deviceNames])

  const setDeviceName = useCallback((udid: string, name: string) => {
    const key = normalizeUdid(udid)
    const value = name.trim()
    if (!key) return
    setDeviceNames((current) => {
      if (!value) {
        const { [key]: _removed, ...remaining } = current
        return remaining
      }
      return current[key] === value ? current : { ...current, [key]: value }
    })
  }, [])

  const getDeviceName = useCallback((udid: string) => deviceNames[normalizeUdid(udid)], [deviceNames])

  return { deviceNames, getDeviceName, setDeviceName }
}
