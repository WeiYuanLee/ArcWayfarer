// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearQuickReconnectRecord,
  connectWirelessDirect,
  getQuickReconnectRecords,
  getWirelessDirectEndpoints,
  type Device,
} from '../../../services/api'
import { useDeviceManagerController } from './useDeviceManagerController'

vi.mock('../../../services/api', async (loadOriginal) => {
  const original = await loadOriginal<typeof import('../../../services/api')>()
  return { ...original, connectWirelessDirect: vi.fn(), getWirelessDirectEndpoints: vi.fn(), pairWirelessDirect: vi.fn(), clearWirelessDirectAddress: vi.fn() }
})
vi.mock('../Toast', () => ({ showToast: vi.fn() }))

const directDevice: Device = {
  udid: 'phone-a', name: 'Lence', ios_version: '18.0', transport: 'rsd', status: 'ready', detail: null,
  connection_type: 'wireless_direct', ip_address: '192.168.1.184', revision: 12,
}

describe('useDeviceManagerController', () => {
  beforeEach(() => {
    clearQuickReconnectRecord()
    vi.mocked(connectWirelessDirect).mockReset()
    vi.mocked(getWirelessDirectEndpoints).mockReset().mockResolvedValue([])
  })
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  function setup(devices: Device[] = []) {
    const onRefreshDevices = vi.fn().mockResolvedValue(undefined)
    const onUnhideDevice = vi.fn()
    const onHideDevice = vi.fn()
    const { result } = renderHook(() => useDeviceManagerController({
      isOpen: true, devices, hiddenDevices: [], deviceNames: {}, onHideDevice, onUnhideDevice, onRefreshDevices,
    }))
    return { result, onRefreshDevices, onUnhideDevice, onHideDevice }
  }

  it('publishes the command revision and records the confirmed endpoint after a successful connect', async () => {
    vi.mocked(connectWirelessDirect).mockResolvedValue(directDevice)
    const { result, onRefreshDevices, onUnhideDevice } = setup()
    await act(async () => {
      await result.current.executeConnect({ targetUdid: '', targetIp: '192.168.1.184', targetName: 'Lence', fallbackBonjour: false, port: 49152 })
    })
    expect(onRefreshDevices).toHaveBeenCalledWith(12)
    expect(onUnhideDevice).toHaveBeenCalledWith('phone-a')
    expect(result.current.view).toBe('list')
    expect(getQuickReconnectRecords()[0]).toMatchObject({ udid: 'phone-a', endpoint: '192.168.1.184:49152' })
  })

  it('keeps a failed command in the error flow and does not alter another device', async () => {
    vi.mocked(connectWirelessDirect).mockRejectedValue(new Error('授權已失效'))
    const other = { ...directDevice, udid: 'phone-b', name: 'Other' }
    const { result, onRefreshDevices, onUnhideDevice, onHideDevice } = setup([other])
    await act(async () => {
      await result.current.executeConnect({ targetUdid: 'phone-a', targetIp: '192.168.1.184', targetName: 'Lence', fallbackBonjour: true, port: 49152 })
    })
    expect(result.current.view).toBe('connecting')
    expect(result.current.connectingState).toMatchObject({ status: 'error', errorMessage: '授權已失效' })
    expect(onRefreshDevices).toHaveBeenCalledWith()
    expect(onUnhideDevice).not.toHaveBeenCalled()
    expect(onHideDevice).not.toHaveBeenCalled()
  })
})
