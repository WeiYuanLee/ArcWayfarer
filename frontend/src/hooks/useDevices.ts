import { useCallback, useEffect, useRef, useState } from 'react'
import { getDeviceDiscoveryDiagnostic, listDevices, type Device, type DeviceDiscoveryDiagnostic } from '../services/api'

export const DEVICE_SCAN_INTERVAL_MS = 20_000

export function useDevices(includeWifi = false) {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [scanError, setScanError] = useState<string | null>(null)
  const [lastSuccessfulScanAt, setLastSuccessfulScanAt] = useState<number | null>(null)
  const [discoveryDiagnostic, setDiscoveryDiagnostic] = useState<DeviceDiscoveryDiagnostic | null>(null)
  const mountedRef = useRef(false)
  const scanInFlightRef = useRef<Promise<void> | null>(null)
  const scanGenerationRef = useRef(0)

  const refresh = useCallback((background = false): Promise<void> => {
    const inFlight = scanInFlightRef.current
    if (inFlight) {
      // A manual rescan can still show progress, but it shares the existing
      // request so periodic scans never compete for device connections.
      if (!background) setLoading(true)
      return inFlight
    }

    if (!background) setLoading(true)
    const scanGeneration = scanGenerationRef.current

    let scan!: Promise<void>
    scan = (async () => {
      try {
        const result = await listDevices({ includeWifi })
        if (!mountedRef.current || scanGeneration !== scanGenerationRef.current) return

        // Retain unknown rows for compatibility with older backends, but never
        // expose a known Wi-Fi row while Wi-Fi discovery is disabled.
        const visible = includeWifi ? result : result.filter((device) => device.connection_type !== 'wifi')
        const unique = visible.filter(
          (device, index, self) => index === self.findIndex((d) => d.udid.toLowerCase() === device.udid.toLowerCase())
        )
        setDevices(unique)
        setScanError(null)
        setLastSuccessfulScanAt(Date.now())
        // This endpoint reads an in-memory snapshot only; it never starts a
        // second usbmux operation, so an unavailable phone cannot make the UI
        // wait for another expensive device scan.
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
      } catch (error) {
        if (!mountedRef.current || scanGeneration !== scanGenerationRef.current) return

        // Keep the last known device list while a transient USB/Wi-Fi scan
        // fails. A successful empty response remains the signal to clear it.
        setScanError(error instanceof Error ? error.message : 'Failed to scan devices')
      } finally {
        if (scanInFlightRef.current === scan) scanInFlightRef.current = null
        if (mountedRef.current && scanGeneration === scanGenerationRef.current) setLoading(false)
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
