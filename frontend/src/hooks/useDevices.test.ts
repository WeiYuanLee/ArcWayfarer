// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEVICE_SCAN_INTERVAL_MS, useDevices } from './useDevices'
import { getDeviceDiscoveryDiagnostic, getDeviceSnapshot, type Device } from '../services/api'

vi.mock('../services/api', () => ({
  getDeviceSnapshot: vi.fn(),
  getDeviceDiscoveryDiagnostic: vi.fn(),
}))

const mockedGetDeviceSnapshot = vi.mocked(getDeviceSnapshot)
const mockedGetDeviceDiscoveryDiagnostic = vi.mocked(getDeviceDiscoveryDiagnostic)
const device = {
  udid: 'device-1',
  name: 'Test iPhone',
  ios_version: '18.0',
  transport: 'lockdown' as const,
  status: 'ready' as const,
  detail: null,
  connection_type: 'usb' as const,
}
const wifiDevice = { ...device, udid: 'wifi-device', name: 'Wi-Fi iPhone', connection_type: 'wifi' as const }
const snapshot = (devices: Device[], revision = 0) => ({ snapshot_revision: revision, sources: {}, devices })

describe('useDevices', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockedGetDeviceSnapshot.mockReset()
    mockedGetDeviceDiscoveryDiagnostic.mockReset()
    mockedGetDeviceDiscoveryDiagnostic.mockResolvedValue(null)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  async function flushRequests() {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('rescans every 20 seconds without overlapping a pending scan', async () => {
    let resolveBackgroundScan: ((devices: typeof device[]) => void) | undefined
    mockedGetDeviceSnapshot
      .mockResolvedValueOnce(snapshot([device], 1))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveBackgroundScan = (devices) => resolve(snapshot(devices, 2)) }))

    const { result } = renderHook(() => useDevices(true))
    await flushRequests()
    expect(result.current.devices).toEqual([device])

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEVICE_SCAN_INTERVAL_MS * 2)
    })
    expect(mockedGetDeviceSnapshot).toHaveBeenCalledTimes(2)

    await act(async () => {
      resolveBackgroundScan?.([device])
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEVICE_SCAN_INTERVAL_MS)
    })
    expect(mockedGetDeviceSnapshot).toHaveBeenCalledTimes(3)
  })

  it('keeps the last successful device list when a later scan fails', async () => {
    mockedGetDeviceSnapshot
      .mockResolvedValueOnce(snapshot([device], 1))
      .mockRejectedValueOnce(new Error('Device scan timed out'))

    const { result } = renderHook(() => useDevices(true))
    await flushRequests()
    expect(result.current.devices).toEqual([device])

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEVICE_SCAN_INTERVAL_MS)
    })

    expect(result.current.devices).toEqual([device])
    expect(result.current.scanError).toBe('Device scan timed out')
    expect(result.current.isStale).toBe(true)
  })

  it('queues one fresh foreground scan and ignores a stale response after a command', async () => {
    let resolveOldScan: ((value: ReturnType<typeof snapshot>) => void) | undefined
    const directDevice = { ...device, connection_type: 'wireless_direct' as const, revision: 2 }
    mockedGetDeviceSnapshot
      .mockResolvedValueOnce(snapshot([device], 1))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOldScan = resolve }))
      .mockResolvedValueOnce(snapshot([directDevice], 2))

    const { result } = renderHook(() => useDevices(true))
    await flushRequests()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEVICE_SCAN_INTERVAL_MS)
    })
    let foreground!: Promise<void>
    act(() => {
      foreground = result.current.refresh(false, 2)
    })

    await act(async () => {
      resolveOldScan?.(snapshot([device], 1))
      await foreground
    })

    expect(mockedGetDeviceSnapshot).toHaveBeenCalledTimes(3)
    expect(result.current.devices).toEqual([directDevice])
  })

  it('removes a device on the first successful scan that no longer finds it', async () => {
    mockedGetDeviceSnapshot
      .mockResolvedValueOnce(snapshot([device], 1))
      .mockResolvedValueOnce(snapshot([], 2))

    const { result } = renderHook(() => useDevices(true))
    await flushRequests()
    expect(result.current.devices).toEqual([device])

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEVICE_SCAN_INTERVAL_MS)
    })
    expect(result.current.devices).toEqual([])
  })

  it('only polls when Wi-Fi discovery is enabled', async () => {
    mockedGetDeviceSnapshot.mockResolvedValue(snapshot([device], 1))

    renderHook(() => useDevices())
    await flushRequests()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEVICE_SCAN_INTERVAL_MS)
    })

    expect(mockedGetDeviceSnapshot).toHaveBeenCalledTimes(1)
    expect(mockedGetDeviceSnapshot).toHaveBeenCalledWith({ includeWifi: false, rescan: true })
  })

  it('rescans a USB-only device list once when the window becomes visible again', async () => {
    let visibility: DocumentVisibilityState = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
    mockedGetDeviceSnapshot.mockResolvedValue(snapshot([device], 1))

    renderHook(() => useDevices(false))
    await flushRequests()
    expect(mockedGetDeviceSnapshot).toHaveBeenCalledTimes(1)

    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await flushRequests()

    expect(mockedGetDeviceSnapshot).toHaveBeenCalledTimes(2)
    expect(mockedGetDeviceSnapshot).toHaveBeenLastCalledWith({ includeWifi: false, rescan: false })
  })

  it('loads a non-blocking support diagnostic only when discovery finds no devices', async () => {
    const diagnostic = {
      code: 'usb_discovery_failed' as const,
      occurred_at: '2026-08-23T00:00:00+00:00',
      error_type: 'OSError',
      message: 'AMDevice service unavailable',
      python_version: '3.13.0',
      platform: 'Darwin 25.0.0 (arm64)',
      pymobiledevice3_version: '11.3.1',
    }
    mockedGetDeviceSnapshot.mockResolvedValue(snapshot([], 1))
    mockedGetDeviceDiscoveryDiagnostic.mockResolvedValue(diagnostic)

    const { result } = renderHook(() => useDevices())
    await flushRequests()

    expect(result.current.devices).toEqual([])
    expect(result.current.discoveryDiagnostic).toEqual(diagnostic)
    expect(mockedGetDeviceDiscoveryDiagnostic).toHaveBeenCalledTimes(1)
  })

  it('immediately hides Wi-Fi devices and ignores an older Wi-Fi scan when disabled', async () => {
    let resolveWifiScan: ((devices: Device[]) => void) | undefined
    mockedGetDeviceSnapshot
      .mockResolvedValueOnce(snapshot([device, wifiDevice], 1))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveWifiScan = (devices) => resolve(snapshot(devices, 2)) }))
      .mockResolvedValueOnce(snapshot([device, wifiDevice], 3))

    const { result, rerender } = renderHook(({ includeWifi }) => useDevices(includeWifi), {
      initialProps: { includeWifi: true },
    })
    await flushRequests()
    expect(result.current.devices).toHaveLength(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEVICE_SCAN_INTERVAL_MS)
    })
    rerender({ includeWifi: false })
    expect(result.current.devices).toEqual([device])

    await act(async () => {
      resolveWifiScan?.([device, wifiDevice])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.devices).toEqual([device])
    expect(mockedGetDeviceSnapshot).toHaveBeenLastCalledWith({ includeWifi: false, rescan: true })
  })
})
