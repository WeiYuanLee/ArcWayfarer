import { describe, expect, it } from 'vitest'
import { MAX_ROUTE_ARROWS, routeArrowCount } from './mapPerformance'

describe('routeArrowCount', () => {
  it('does not render arrows for tiny routes', () => {
    expect(routeArrowCount(39)).toBe(0)
  })

  it('preserves normal route density', () => {
    expect(routeArrowCount(900)).toBe(5)
  })

  it('caps very long routes', () => {
    expect(routeArrowCount(1_000_000)).toBe(MAX_ROUTE_ARROWS)
  })
})
