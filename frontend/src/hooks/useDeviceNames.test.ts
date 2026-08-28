// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEVICE_NAMES_STORAGE_KEY, useDeviceNames } from './useDeviceNames'

describe('useDeviceNames', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('persists names by UDID and removes the override for an empty name', () => {
    const { result } = renderHook(() => useDeviceNames())
    act(() => result.current.setDeviceName('DEVICE-1', 'My main phone'))
    expect(result.current.getDeviceName('device-1')).toBe('My main phone')
    expect(JSON.parse(localStorage.getItem(DEVICE_NAMES_STORAGE_KEY) || '{}')).toEqual({ 'device-1': 'My main phone' })

    act(() => result.current.setDeviceName('device-1', '   '))
    expect(result.current.getDeviceName('DEVICE-1')).toBeUndefined()
  })
})
