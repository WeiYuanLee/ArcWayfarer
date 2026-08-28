// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HIDDEN_DEVICES_STORAGE_KEY, useHiddenDevices } from './useHiddenDevices'

const device = {
  udid: '00008120-00065CDA1EB401E',
  name: 'Test iPhone',
  ios_version: '18.0',
  connection_type: 'wifi' as const,
}

describe('useHiddenDevices', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('persists a hidden device and matches its UDID without case sensitivity', () => {
    const { result, unmount } = renderHook(() => useHiddenDevices())

    act(() => result.current.hideDevice(device))
    expect(result.current.isHidden(device.udid.toLowerCase())).toBe(true)
    expect(JSON.parse(localStorage.getItem(HIDDEN_DEVICES_STORAGE_KEY) || '[]')).toHaveLength(1)

    unmount()
    const restored = renderHook(() => useHiddenDevices())
    expect(restored.result.current.hiddenDevices[0]).toMatchObject({ udid: device.udid, name: device.name })
  })

  it('ignores an invalid saved preference', () => {
    localStorage.setItem(HIDDEN_DEVICES_STORAGE_KEY, '{invalid')
    const { result } = renderHook(() => useHiddenDevices())
    expect(result.current.hiddenDevices).toEqual([])
  })
})
