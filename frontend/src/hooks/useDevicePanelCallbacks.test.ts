// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import type { LatLng } from '../components/panels/types'
import { useDevicePanelCallbacks } from './useDevicePanelCallbacks'

describe('useDevicePanelCallbacks', () => {
  it('keeps callback identities stable when point state rerenders App', () => {
    const requestPointForDevice = vi.fn()
    const { result } = renderHook(() => {
      const [points, setPoints] = useState<Record<string, LatLng | null>>({})
      return { points, callbacks: useDevicePanelCallbacks(setPoints, requestPointForDevice) }
    })

    const first = result.current.callbacks('device-1')
    act(() => first.setPoint({ lat: 25, lng: 121 }))

    expect(result.current.points['device-1']).toEqual({ lat: 25, lng: 121 })
    expect(result.current.callbacks('device-1')).toBe(first)
    expect(result.current.callbacks('device-2')).not.toBe(first)
  })

  it('binds map-pick and clear actions to the correct device', () => {
    const requestPointForDevice = vi.fn()
    const { result } = renderHook(() => {
      const [points, setPoints] = useState<Record<string, LatLng | null>>({
        'device-1': { lat: 25, lng: 121 },
      })
      return { points, callbacks: useDevicePanelCallbacks(setPoints, requestPointForDevice) }
    })
    const callbacks = result.current.callbacks('device-1')
    const onPick = vi.fn()

    callbacks.requestPoint(onPick)
    act(() => callbacks.clearPoint?.())

    expect(requestPointForDevice).toHaveBeenCalledWith('device-1', onPick)
    expect(result.current.points['device-1']).toBeNull()
  })
})
