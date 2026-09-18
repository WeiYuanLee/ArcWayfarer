// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useWaypointList } from './useWaypointList'

describe('useWaypointList addWaypoint', () => {
  it('keeps waypoint geometry stable across unrelated renders', () => {
    const { result, rerender } = renderHook(() => useWaypointList(2))
    const initial = result.current.validWaypoints

    rerender()
    expect(result.current.validWaypoints).toBe(initial)

    act(() => result.current.addWaypoint({ lat: 25.03, lng: 121.56 }))
    expect(result.current.validWaypoints).not.toBe(initial)
    expect(result.current.validWaypoints).toEqual([{ lat: 25.03, lng: 121.56 }])
  })

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

describe('useWaypointList route ordering', () => {
  it('preserves item IDs while moving invalid rows after optimized coordinates', () => {
    const { result } = renderHook(() => useWaypointList(2))

    act(() => result.current.handleTextChange(0, 'unfinished'))
    act(() => result.current.updateWaypoint(1, { lat: 25.01, lng: 121.01 }))
    act(() => result.current.addWaypoint({ lat: 25.02, lng: 121.02 }))
    act(() => result.current.addWaypoint({ lat: 25.03, lng: 121.03 }))
    const validIds = result.current.items.filter((item) => item.point).map((item) => item.id)
    const invalidId = result.current.items.find((item) => !item.point)?.id

    act(() => result.current.reorderValidWaypoints([0, 2, 1]))

    expect(result.current.items.slice(0, 3).map((item) => item.id)).toEqual([
      validIds[0], validIds[2], validIds[1],
    ])
    expect(result.current.items[3].id).toBe(invalidId)
    expect(result.current.items[3].rawText).toBe('unfinished')
  })

  it('restores an exact waypoint snapshot and advances its revision', () => {
    const { result } = renderHook(() => useWaypointList(2))
    act(() => result.current.updateWaypoint(0, { lat: 25.01, lng: 121.01 }))
    act(() => result.current.updateWaypoint(1, { lat: 25.02, lng: 121.02 }))
    const snapshot = result.current.items.map((item) => ({ ...item }))
    const revisionBeforeReorder = result.current.revision

    act(() => result.current.reorderValidWaypoints([1, 0]))
    expect(result.current.revision).toBeGreaterThan(revisionBeforeReorder)
    act(() => result.current.restoreItems(snapshot))

    expect(result.current.items).toEqual(snapshot)
  })
})
