import { describe, expect, it } from 'vitest'
import { coordinateLocalTime } from './coordinateLocalTime'

describe('coordinateLocalTime', () => {
  const instant = new Date('2026-09-23T00:05:00Z')

  it('uses the time zone at the selected coordinate rather than the computer time zone', () => {
    expect(coordinateLocalTime(instant, 25.033, 121.565, 'zh-TW')).toEqual({
      display: '09/23 08:05',
      timeZone: 'Asia/Taipei',
    })
    expect(coordinateLocalTime(instant, 41.8781, -87.6298, 'en-US')).toEqual({
      display: '09/22 19:05',
      timeZone: 'America/Chicago',
    })
  })

  it('returns no local time for missing or invalid coordinates', () => {
    expect(coordinateLocalTime(instant, null, null, 'zh-TW')).toBeNull()
    expect(coordinateLocalTime(instant, 91, 121, 'zh-TW')).toBeNull()
  })
})
