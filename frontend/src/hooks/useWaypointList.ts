import { useCallback, useMemo, useRef, useState } from 'react'
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
  const [revision, setRevision] = useState(0)
  const revisionRef = useRef(0)

  const markChanged = useCallback(() => {
    revisionRef.current += 1
    setRevision(revisionRef.current)
    return revisionRef.current
  }, [])

  const validWaypoints = useMemo(() => items
    .map((item) => item.point)
    .filter((pt): pt is LatLng => pt !== null), [items])

  const updateWaypoint = useCallback((idx: number, point: LatLng) => {
    markChanged()
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, point, rawText: formatPoint(point) } : item
      )
    )
  }, [markChanged])

  const handleTextChange = useCallback((idx: number, value: string) => {
    markChanged()
    const parsed = parsePoint(value)
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, point: parsed, rawText: value } : item
      )
    )
  }, [markChanged])

  const addWaypoint = useCallback((pt?: LatLng) => {
    markChanged()
    setItems((prev) => {
      if (pt) {
        const emptyIndex = prev.findIndex((item) => item.point === null && item.rawText.trim() === '')
        if (emptyIndex !== -1) {
          return prev.map((item, index) =>
            index === emptyIndex ? { ...item, point: pt, rawText: formatPoint(pt) } : item
          )
        }
      }

      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          point: pt ?? null,
          rawText: pt ? formatPoint(pt) : '',
        },
      ]
    })
  }, [markChanged])

  const insertWaypointAfter = useCallback((idx: number, pt: LatLng) => {
    markChanged()
    setItems((prev) => {
      const next = [...prev]
      next.splice(idx + 1, 0, {
        id: crypto.randomUUID(),
        point: pt,
        rawText: formatPoint(pt),
      })
      return next
    })
  }, [markChanged])

  const removeWaypoint = useCallback((idx: number) => {
    markChanged()
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }, [markChanged])

  const moveWaypoint = useCallback((idx: number, direction: 'up' | 'down') => {
    markChanged()
    setItems((prev) => {
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= prev.length) return prev
      const next = [...prev]
      const temp = next[idx]
      next[idx] = next[targetIdx]
      next[targetIdx] = temp
      return next
    })
  }, [markChanged])

  const clearAllWaypoints = useCallback(() => {
    markChanged()
    setItems(createDefaultItems(initialCount))
  }, [initialCount, markChanged])

  const setAllWaypoints = useCallback((points: LatLng[]) => {
    markChanged()
    setItems(
      points.map((pt) => ({
        id: crypto.randomUUID(),
        point: pt,
        rawText: formatPoint(pt),
      }))
    )
  }, [markChanged])

  const reverseWaypoints = useCallback(() => {
    markChanged()
    setItems((prev) => [...prev].reverse())
  }, [markChanged])

  const setAsStart = useCallback((idx: number) => {
    markChanged()
    setItems((prev) => {
      if (idx <= 0 || idx >= prev.length) return prev
      return [...prev.slice(idx), ...prev.slice(0, idx)]
    })
  }, [markChanged])

  const reorderValidWaypoints = useCallback((orderedValidIndices: number[]) => {
    const nextRevision = markChanged()
    setItems((prev) => {
      const validItems = prev.filter((item) => item.point !== null)
      const invalidItems = prev.filter((item) => item.point === null)
      const isValidPermutation = orderedValidIndices.length === validItems.length
        && new Set(orderedValidIndices).size === validItems.length
        && orderedValidIndices.every((index) => index >= 0 && index < validItems.length)
      if (!isValidPermutation) return prev
      return [...orderedValidIndices.map((index) => validItems[index]), ...invalidItems]
    })
    return nextRevision
  }, [markChanged])

  const restoreItems = useCallback((snapshot: WayPointItem[]) => {
    const nextRevision = markChanged()
    setItems(snapshot.map((item) => ({ ...item })))
    return nextRevision
  }, [markChanged])

  return {
    items,
    revision,
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
    reorderValidWaypoints,
    restoreItems,
  }
}
