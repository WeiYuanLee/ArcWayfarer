import { describe, expect, it } from 'vitest'
import { limitDisplayPath } from './pathGeometry'

describe('limitDisplayPath', () => {
  it('retains the original reference for already-small paths', () => {
    const path = [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }]
    expect(limitDisplayPath(path)).toBe(path)
  })

  it('bounds dense paths and preserves both endpoints', () => {
    const path = Array.from({ length: 101 }, (_, index) => ({ lat: index, lng: index }))
    const result = limitDisplayPath(path, 10)
    expect(result).toHaveLength(10)
    expect(result[0]).toBe(path[0])
    expect(result.at(-1)).toBe(path.at(-1))
  })
})
