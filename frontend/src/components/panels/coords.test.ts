import { describe, expect, it } from 'vitest'
import { calculateRemainingDistanceMeters } from './coords'

describe('calculateRemainingDistanceMeters', () => {
  const start = { lat: 25, lng: 121 }
  const middle = { lat: 25, lng: 121.01 }
  const end = { lat: 25, lng: 121.02 }

  it('returns the distance left on the current route leg', () => {
    const remaining = calculateRemainingDistanceMeters(
      [start, middle, end],
      [start, end],
      middle,
      1,
      false,
    )

    expect(remaining).toBeCloseTo(1008, -1)
  })

  it('returns no estimate until a live position is available', () => {
    expect(calculateRemainingDistanceMeters([start, end], [start, end], null, 1, false)).toBeNull()
  })
})
