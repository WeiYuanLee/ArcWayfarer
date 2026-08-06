import { useCallback, useState } from 'react'
import type { LatLng } from '../components/panels/types'
import { formatPoint, parsePoint } from '../components/panels/coords'

export interface WayPointItem {
  id: string
  point: LatLng | null
  rawText: string
}

function createDefaultItems(initialCount = 2): WayPointItem[] {
  return Array.from({ length: initialCount }, () => ({
    id: crypto.randomUUID(),
    point: null,
    rawText: '',
  }))
}

export function useWaypointList(initialCount = 2) {
  const [items, setItems] = useState<WayPointItem[]>(() => createDefaultItems(initialCount))

  const validWaypoints = items
    .map((item) => item.point)
    .filter((pt): pt is LatLng => pt !== null)

  const updateWaypoint = useCallback((idx: number, point: LatLng) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, point, rawText: formatPoint(point) } : item
      )
    )
  }, [])

  const handleTextChange = useCallback((idx: number, value: string) => {
    const parsed = parsePoint(value)
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, point: parsed, rawText: value } : item
      )
    )
  }, [])

  const addWaypoint = useCallback((pt?: LatLng) => {
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        point: pt ?? null,
        rawText: pt ? formatPoint(pt) : '',
      },
    ])
  }, [])

  const insertWaypointAfter = useCallback((idx: number, pt: LatLng) => {
    setItems((prev) => {
      const next = [...prev]
      next.splice(idx + 1, 0, {
        id: crypto.randomUUID(),
        point: pt,
        rawText: formatPoint(pt),
      })
      return next
    })
  }, [])

  const removeWaypoint = useCallback((idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const moveWaypoint = useCallback((idx: number, direction: 'up' | 'down') => {
    setItems((prev) => {
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= prev.length) return prev
      const next = [...prev]
      const temp = next[idx]
      next[idx] = next[targetIdx]
      next[targetIdx] = temp
      return next
    })
  }, [])

  const clearAllWaypoints = useCallback(() => {
    setItems(createDefaultItems(initialCount))
  }, [initialCount])

  const setAllWaypoints = useCallback((points: LatLng[]) => {
    setItems(
      points.map((pt) => ({
        id: crypto.randomUUID(),
        point: pt,
        rawText: formatPoint(pt),
      }))
    )
  }, [])

  const reverseWaypoints = useCallback(() => {
    setItems((prev) => [...prev].reverse())
  }, [])

  const setAsStart = useCallback((idx: number) => {
    setItems((prev) => {
      if (idx <= 0 || idx >= prev.length) return prev
      return [...prev.slice(idx), ...prev.slice(0, idx)]
    })
  }, [])

  return {
    items,
    setItems,
    validWaypoints,
    updateWaypoint,
    handleTextChange,
    addWaypoint,
    insertWaypointAfter,
    removeWaypoint,
    moveWaypoint,
    clearAllWaypoints,
    setAllWaypoints,
    reverseWaypoints,
    setAsStart,
  }
}
