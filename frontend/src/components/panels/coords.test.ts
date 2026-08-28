import { describe, expect, it } from 'vitest'
import { calculateRemainingDistanceMeters, parsePastedPoints } from './coords'

describe('parsePastedPoints', () => {
  it('imports every coordinate pair when OCR collapses them onto one line', () => {
    expect(parsePastedPoints('46.204880,10.132918 46.204880,10.132918 46.204880,10.132918')).toEqual({
      points: [
        { lat: 46.20488, lng: 10.132918 },
        { lat: 46.20488, lng: 10.132918 },
        { lat: 46.20488, lng: 10.132918 },
      ],
      invalidCount: 0,
    })
  })

  it('discards Chinese text while retaining full-width OCR coordinates', () => {
    expect(parsePastedPoints('第一站 緯度：２５．０３３，經度：１２１．５６５\n第二站 25.041、121.557')).toEqual({
      points: [
        { lat: 25.033, lng: 121.565 },
        { lat: 25.041, lng: 121.557 },
      ],
      invalidCount: 0,
    })
  })

  it('skips out-of-range OCR results without discarding valid pairs', () => {
    expect(parsePastedPoints('緯度 999, 經度 121\n25.033, 121.565')).toEqual({
      points: [{ lat: 25.033, lng: 121.565 }],
      invalidCount: 1,
    })
  })
})

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
