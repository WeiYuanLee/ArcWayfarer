import { useCallback, useEffect, useRef, useState } from 'react'
import { getDeviceDiscoveryDiagnostic, getDeviceSnapshot, type Device, type DeviceDiscoveryDiagnostic } from '../services/api'

export const DEVICE_SCAN_INTERVAL_MS = 20_000
export const DEVICE_RESUME_SCAN_DEBOUNCE_MS = 5_000

export function useDevices(includeWifi = false) {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [scanError, setScanError] = useState<string | null>(null)
  const [lastSuccessfulScanAt, setLastSuccessfulScanAt] = useState<number | null>(null)
  const [discoveryDiagnostic, setDiscoveryDiagnostic] = useState<DeviceDiscoveryDiagnostic | null>(null)
  const mountedRef = useRef(false)
  const scanInFlightRef = useRef<Promise<void> | null>(null)
  const pendingForegroundRefreshRef = useRef<Promise<void> | null>(null)
  const highestSnapshotRevisionRef = useRef(0)
  const highestDeviceRevisionsRef = useRef<Map<string, number>>(new Map())
  const scanGenerationRef = useRef(0)
  const hiddenAtRef = useRef<number | null>(null)
  const lastResumeScanAtRef = useRef(Number.NEGATIVE_INFINITY)

  const refresh = useCallback((background = false, minimumRevision = 0): Promise<void> => {
    highestSnapshotRevisionRef.current = Math.max(highestSnapshotRevisionRef.current, minimumRevision)
    const inFlight = scanInFlightRef.current
    if (inFlight) {
      if (background) return inFlight
      setLoading(true)
      // A command-triggered refresh must observe state newer than the request
      // already in flight. Coalesce all foreground waiters into one follow-up.
      if (pendingForegroundRefreshRef.current) return pendingForegroundRefreshRef.current
      let pending!: Promise<void>
      pending = inFlight.then(() => {
        if (pendingForegroundRefreshRef.current === pending) pendingForegroundRefreshRef.current = null
        return refresh(false, minimumRevision)
      })
      pendingForegroundRefreshRef.current = pending
      return pending
    }

    if (!background) setLoading(true)
    const scanGeneration = scanGenerationRef.current

    let scan!: Promise<void>
    scan = (async () => {
      let staleRevision = false
      try {
        const snapshot = await getDeviceSnapshot({ includeWifi })
        if (!mountedRef.current || scanGeneration !== scanGenerationRef.current) return
        if (snapshot.snapshot_revision < highestSnapshotRevisionRef.current) {
          staleRevision = true
        } else {
          highestSnapshotRevisionRef.current = snapshot.snapshot_revision
          const result = snapshot.devices
          for (const device of result) {
            const key = device.udid.toLowerCase()
            highestDeviceRevisionsRef.current.set(
              key,
              Math.max(highestDeviceRevisionsRef.current.get(key) ?? 0, device.revision ?? 0),
            )
          }

          // A successful scan is authoritative: only currently discovered
          // routes may appear, and disabling Wi-Fi hides network routes.
          const visible = includeWifi ? result : result.filter((device) => device.connection_type !== 'wifi')
          const unique = visible.filter(
            (device, index, self) => index === self.findIndex((d) => d.udid.toLowerCase() === device.udid.toLowerCase())
          )
          setDevices(unique)
          setScanError(null)
          setLastSuccessfulScanAt(Date.now())
          if (unique.length === 0) {
            try {
              const diagnostic = await getDeviceDiscoveryDiagnostic()
              if (mountedRef.current && scanGeneration === scanGenerationRef.current) setDiscoveryDiagnostic(diagnostic)
            } catch {
              // Diagnostics are supplementary. A failed read must not turn a
              // successful empty scan into a user-visible scan failure.
            }
          } else {
            setDiscoveryDiagnostic(null)
          }
        }
      } catch (error) {
        if (!mountedRef.current || scanGeneration !== scanGenerationRef.current) return

        // Keep the last known device list while a transient USB/Wi-Fi scan
        // fails. A successful empty response remains the signal to clear it.
        setScanError(error instanceof Error ? error.message : 'Failed to scan devices')
      } finally {
        if (scanInFlightRef.current === scan) scanInFlightRef.current = null
        if (mountedRef.current && scanGeneration === scanGenerationRef.current) setLoading(false)
      }
      if (
        staleRevision &&
        pendingForegroundRefreshRef.current === null &&
        mountedRef.current &&
        scanGeneration === scanGenerationRef.current
      ) {
        await refresh(false, highestSnapshotRevisionRef.current)
      }
    })()

    scanInFlightRef.current = scan
    return scan
  }, [includeWifi])

  useEffect(() => {
    const scanGeneration = ++scanGenerationRef.current
    mountedRef.current = true
    if (!includeWifi) {
      // Do this before the USB-only replacement scan finishes, so disabling
      // Wi-Fi discovery immediately hides any previously discovered Wi-Fi row.
      setDevices((current) => current.filter((device) => device.connection_type !== 'wifi'))
    }

    const priorScan = scanInFlightRef.current
    if (priorScan) {
      // A setting change must not publish the old scan's result. Once it has
      // released the single-flight lock, fetch using the current preference.
      void priorScan.finally(() => {
        if (mountedRef.current && scanGenerationRef.current === scanGeneration) void refresh()
      })
    } else {
      void refresh()
    }

    if (!includeWifi) {
      return () => {
        mountedRef.current = false
      }
    }

    const intervalId = window.setInterval(() => {
      void refresh(true)
    }, DEVICE_SCAN_INTERVAL_MS)

    return () => {
      mountedRef.current = false
      window.clearInterval(intervalId)
    }
  }, [includeWifi, refresh])

  useEffect(() => {
    const refreshAfterResume = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now()
        return
      }

      const now = Date.now()
      if (now - lastResumeScanAtRef.current < DEVICE_RESUME_SCAN_DEBOUNCE_MS) return
      lastResumeScanAtRef.current = now
      hiddenAtRef.current = null
      void refresh(true)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now()
      } else if (hiddenAtRef.current !== null) {
        refreshAfterResume()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    const unsubscribeRestore = window.electronAPI?.onWindowRestored(refreshAfterResume)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      unsubscribeRestore?.()
    }
  }, [refresh])

  return {
    devices,
    loading,
    refresh,
    scanError,
    lastSuccessfulScanAt,
    discoveryDiagnostic,
    isStale: scanError !== null && devices.length > 0,
  }
}
