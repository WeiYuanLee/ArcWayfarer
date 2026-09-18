import { describe, expect, it } from 'vitest'
import type { LatLng } from './types'
import { MAX_OPTIMIZABLE_POINTS, optimizeRouteOrder } from './routeOptimizer'

function expectPermutation(order: number[], count: number) {
  expect([...order].sort((left, right) => left - right)).toEqual(
    Array.from({ length: count }, (_, index) => index),
  )
}

describe('optimizeRouteOrder', () => {
  it('keeps the first waypoint fixed and removes an open-route detour', () => {
    const points: LatLng[] = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 3 },
      { lat: 0, lng: 1 },
      { lat: 0, lng: 2 },
    ]

    const result = optimizeRouteOrder(points, { isClosedLoop: false })

    expect(result.order[0]).toBe(0)
    expect(result.order).toEqual([0, 2, 3, 1])
    expect(result.optimizedDistance).toBeLessThan(result.originalDistance)
    expectPermutation(result.order, points.length)
  })

  it('includes the return edge when optimizing a closed route', () => {
    const points: LatLng[] = [
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 0 },
    ]

    const result = optimizeRouteOrder(points, { isClosedLoop: true })

    expect(result.order[0]).toBe(0)
    expect(result.optimizedDistance).toBeLessThan(result.originalDistance)
    expectPermutation(result.order, points.length)
  })

  it('returns duplicate coordinates exactly once and never worsens the route', () => {
    const points: LatLng[] = [
      { lat: 25, lng: 121 },
      { lat: 25, lng: 121 },
      { lat: 25.02, lng: 121.02 },
      { lat: 25.01, lng: 121.01 },
    ]

    const result = optimizeRouteOrder(points, { isClosedLoop: false })

    expect(result.order[0]).toBe(0)
    expect(result.optimizedDistance).toBeLessThanOrEqual(result.originalDistance)
    expectPermutation(result.order, points.length)
  })

  it('leaves fewer than three points unchanged', () => {
    const points: LatLng[] = [
      { lat: 25, lng: 121 },
      { lat: 25.01, lng: 121.01 },
    ]

    expect(optimizeRouteOrder(points, { isClosedLoop: false }).order).toEqual([0, 1])
  })

  it('is deterministic when every waypoint has zero distance from the others', () => {
    const points = Array.from({ length: 10 }, () => ({ lat: 25, lng: 121 }))

    const first = optimizeRouteOrder(points, { isClosedLoop: true })
    const second = optimizeRouteOrder(points, { isClosedLoop: true })

    expect(first).toEqual(second)
    expect(first.order).toEqual(Array.from({ length: points.length }, (_, index) => index))
    expect(first.savedDistance).toBe(0)
  })

  it('keeps randomized open and closed routes as valid non-worsening permutations', () => {
    let state = 0x12345678
    const random = () => {
      state = (1664525 * state + 1013904223) >>> 0
      return state / 0x100000000
    }

    for (let sample = 0; sample < 20; sample += 1) {
      const points = Array.from({ length: 12 }, () => ({
        lat: 24.9 + random() * 0.2,
        lng: 120.9 + random() * 0.2,
      }))
      for (const isClosedLoop of [false, true]) {
        const result = optimizeRouteOrder(points, { isClosedLoop })
        expect(result.order[0]).toBe(0)
        expectPermutation(result.order, points.length)
        expect(result.optimizedDistance).toBeLessThanOrEqual(result.originalDistance + 1e-6)
        expect(result).toEqual(optimizeRouteOrder(points, { isClosedLoop }))
      }
    }
  })

  it('refuses oversized routes without allocating a dense distance matrix', () => {
    const points = Array.from({ length: MAX_OPTIMIZABLE_POINTS + 1 }, (_, index) => ({
      lat: 25 + index * 0.00001,
      lng: 121,
    }))

    const result = optimizeRouteOrder(points, { isClosedLoop: false })

    expect(result.wasLimited).toBe(true)
    expect(result.order).toEqual(Array.from({ length: points.length }, (_, index) => index))
    expect(result.optimizedDistance).toBe(result.originalDistance)
  })

  it('uses the bounded optimization tier at the supported upper limit', () => {
    const points = Array.from({ length: MAX_OPTIMIZABLE_POINTS }, (_, index) => ({
      lat: 25 + index * 0.00001,
      lng: 121,
    }))

    const result = optimizeRouteOrder(points, { isClosedLoop: false })

    expect(result.wasLimited).toBe(false)
    expect(result.order[0]).toBe(0)
    expectPermutation(result.order, points.length)
    expect(result.optimizedDistance).toBeLessThanOrEqual(result.originalDistance)
  })
})
