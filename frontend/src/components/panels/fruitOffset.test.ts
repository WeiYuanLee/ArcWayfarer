import { describe, expect, it } from 'vitest'
import { formatFruitOffsetText, fruitOffsetsToGpx, generateFruitOffsets, offsetCoordinate } from './fruitOffset'

describe('fruit offset coordinates', () => {
  const flower = { lat: 25.0339, lng: 121.5644 }

  it('uses north-clockwise bearings', () => {
    const north = offsetCoordinate(flower, 35, 0)
    const east = offsetCoordinate(flower, 35, 90)
    expect(north.lat).toBeGreaterThan(flower.lat)
    expect(north.lng).toBeCloseTo(flower.lng, 8)
    expect(east.lat).toBeCloseTo(flower.lat, 8)
    expect(east.lng).toBeGreaterThan(flower.lng)
  })

  it('keeps seeded random output deterministic', () => {
    const points = [flower, { lat: 25.0345, lng: 121.565 }]
    const first = generateFruitOffsets(points, { distanceMeters: 35, seed: 'preview-1' })
    const second = generateFruitOffsets(points, { distanceMeters: 35, seed: 'preview-1' })
    expect(first).toEqual(second)
  })

  it('serializes randomly generated share outputs', () => {
    const points = generateFruitOffsets(Array.from({ length: 9 }, () => flower), { distanceMeters: 35, seed: 'share' })
    expect(formatFruitOffsetText(points)).toContain('已位移 35m')
    expect(fruitOffsetsToGpx(points)).toContain('Fruit #1 (Flower #1)')
  })
})
