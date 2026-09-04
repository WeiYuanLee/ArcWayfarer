import { describe, expect, it } from 'vitest'
import { limitTextContours, orderTextContoursForTraversal, validateTextPattern } from './textPattern'

describe('validateTextPattern', () => {
  it('accepts five Chinese characters and twelve English letters', () => {
    expect(validateTextPattern('臺北車站前').valid).toBe(true)
    expect(validateTextPattern('ArcWayfarer').englishLetters).toBe(11)
    expect(validateTextPattern('abcdefghijkl').valid).toBe(true)
  })

  it('rejects excess Chinese characters or English letters', () => {
    expect(validateTextPattern('臺北車站前廣').error).toBe('chinese_limit')
    expect(validateTextPattern('abcdefghijklm').error).toBe('english_limit')
  })

  it('rejects emoji until a licensed vector fallback is included', () => {
    expect(validateTextPattern('台北⭐').error).toBe('emoji')
  })

  it('limits contours without joining their separate strokes', () => {
    const contours = Array.from({ length: 3 }, (_, contour) => Array.from({ length: 100 }, (_, index) => ({ x: contour, y: index })))
    const limited = limitTextContours(contours, 30)
    expect(limited).toHaveLength(3)
    expect(limited.every((contour) => contour.length >= 2)).toBe(true)
    expect(limited.flat().length).toBeLessThanOrEqual(30)
  })

  it('starts traversal with the left-most text contour', () => {
    const contours = orderTextContoursForTraversal([
      [{ lat: 25, lng: 122 }, { lat: 24, lng: 122 }, { lat: 24, lng: 123 }, { lat: 25, lng: 122 }],
      [{ lat: 25, lng: 120 }, { lat: 24, lng: 120 }, { lat: 24, lng: 121 }, { lat: 25, lng: 120 }],
    ])
    expect(contours[0][0]).toEqual({ lat: 25, lng: 120 })
  })
})
