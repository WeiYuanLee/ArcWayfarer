// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useWaypointList } from './useWaypointList'

describe('useWaypointList addWaypoint', () => {
  it('fills initial empty slots before appending map-picked waypoints', () => {
    const { result } = renderHook(() => useWaypointList(2))

    act(() => result.current.addWaypoint({ lat: 25.03, lng: 121.56 }))
    expect(result.current.items).toHaveLength(2)
    expect(result.current.items[0].point).toEqual({ lat: 25.03, lng: 121.56 })

    act(() => result.current.addWaypoint({ lat: 25.04, lng: 121.57 }))
    expect(result.current.items).toHaveLength(2)
    expect(result.current.items[1].point).toEqual({ lat: 25.04, lng: 121.57 })

    act(() => result.current.addWaypoint({ lat: 25.05, lng: 121.58 }))
    expect(result.current.items).toHaveLength(3)
    expect(result.current.items[2].point).toEqual({ lat: 25.05, lng: 121.58 })
  })

  it('still appends a new empty slot when no coordinate is supplied', () => {
    const { result } = renderHook(() => useWaypointList(2))

    act(() => result.current.addWaypoint())

    expect(result.current.items).toHaveLength(3)
    expect(result.current.items[2].point).toBeNull()
  })

  it('does not overwrite non-empty invalid coordinate input', () => {
    const { result } = renderHook(() => useWaypointList(2))

    act(() => result.current.handleTextChange(0, 'not a coordinate'))
    act(() => result.current.addWaypoint({ lat: 25.03, lng: 121.56 }))

    expect(result.current.items[0].rawText).toBe('not a coordinate')
    expect(result.current.items[1].point).toEqual({ lat: 25.03, lng: 121.56 })
  })
})
