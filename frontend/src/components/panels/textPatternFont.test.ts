import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'opentype.js'
import { describe, expect, it } from 'vitest'
import { outerTextContours, textContours, unsupportedFontCharacters } from './textPattern'

describe('packaged text route font', () => {
  const bytes = readFileSync(resolve(process.cwd(), 'public/fonts/NotoSansCJKtc-Regular.otf'))
  const font = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)

  it('contains usable outlines for Traditional Chinese and Latin text', () => {
    expect(unsupportedFontCharacters(font, '臺北 Arc')).toEqual([])
    expect(textContours(font, '臺北 Arc')).not.toHaveLength(0)
  })

  it('keeps closed glyph contours closed after conversion', () => {
    const contours = textContours(font, '早')
    expect(contours.some((contour) => contour[0].x === contour[contour.length - 1].x && contour[0].y === contour[contour.length - 1].y)).toBe(true)
  })

  it('extracts only outer, buffered contours for a glyph', () => {
    const raw = textContours(font, '安')
    const outer = outerTextContours(raw)
    expect(outer.length).toBeGreaterThan(0)
    expect(outer.length).toBeLessThanOrEqual(raw.length)
    expect(outer.every((contour) => contour.length >= 3)).toBe(true)
  })
})
