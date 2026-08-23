// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEVICE_SCAN_INTERVAL_MS, useDevices } from './useDevices'
import { getDeviceDiscoveryDiagnostic, listDevices } from '../services/api'

vi.mock('../services/api', () => ({
  listDevices: vi.fn(),
  getDeviceDiscoveryDiagnostic: vi.fn(),
}))

const mockedListDevices = vi.mocked(listDevices)
const mockedGetDeviceDiscoveryDiagnostic = vi.mocked(getDeviceDiscoveryDiagnostic)
const device = {
  udid: 'device-1',
  name: 'Test iPhone',
  ios_version: '18.0',
  transport: 'lockdown' as const,
  status: 'ready' as const,
  detail: null,
}
const wifiDevice = { ...device, udid: 'wifi-device', name: 'Wi-Fi iPhone', connection_type: 'wifi' as const }

describe('useDevices', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockedListDevices.mockReset()
    mockedGetDeviceDiscoveryDiagnostic.mockReset()
    mockedGetDeviceDiscoveryDiagnostic.mockResolvedValue(null)
  })

  afterEach(() => {
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
    mockedListDevices
      .mockResolvedValueOnce([device])
      .mockImplementationOnce(() => new Promise((resolve) => { resolveBackgroundScan = resolve }))

    const { result } = renderHook(() => useDevices(true))
    await flushRequests()
    expect(result.current.devices).toEqual([device])

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEVICE_SCAN_INTERVAL_MS * 2)
    })
    expect(mockedListDevices).toHaveBeenCalledTimes(2)

    await act(async () => {
      resolveBackgroundScan?.([device])
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEVICE_SCAN_INTERVAL_MS)
    })
    expect(mockedListDevices).toHaveBeenCalledTimes(3)
  })

  it('keeps the last successful device list when a later scan fails', async () => {
    mockedListDevices
      .mockResolvedValueOnce([device])
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

  it('only polls when Wi-Fi discovery is enabled', async () => {
    mockedListDevices.mockResolvedValue([device])

    renderHook(() => useDevices())
    await flushRequests()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEVICE_SCAN_INTERVAL_MS)
    })

    expect(mockedListDevices).toHaveBeenCalledTimes(1)
    expect(mockedListDevices).toHaveBeenCalledWith({ includeWifi: false })
  })

  it('loads a non-blocking support diagnostic only when discovery finds no devices', async () => {
    const diagnostic = {
      code: 'usb_discovery_failed' as const,
      occurred_at: '2026-08-23T00:00:00+00:00',
      error_type: 'OSError',
      message: 'AMDevice service unavailable',
      python_version: '3.13.0',
      platform: 'Darwin 25.0.0 (arm64)',
      pymobiledevice3_version: '10.2.1',
    }
    mockedListDevices.mockResolvedValue([])
    mockedGetDeviceDiscoveryDiagnostic.mockResolvedValue(diagnostic)

    const { result } = renderHook(() => useDevices())
    await flushRequests()

    expect(result.current.devices).toEqual([])
    expect(result.current.discoveryDiagnostic).toEqual(diagnostic)
    expect(mockedGetDeviceDiscoveryDiagnostic).toHaveBeenCalledTimes(1)
  })

  it('immediately hides Wi-Fi devices and ignores an older Wi-Fi scan when disabled', async () => {
    let resolveWifiScan: ((devices: typeof device[]) => void) | undefined
    mockedListDevices
      .mockResolvedValueOnce([device, wifiDevice])
      .mockImplementationOnce(() => new Promise((resolve) => { resolveWifiScan = resolve }))
      .mockResolvedValueOnce([device, wifiDevice])

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
    expect(mockedListDevices).toHaveBeenLastCalledWith({ includeWifi: false })
  })
})
