import { describe, expect, it } from 'vitest'
import { normalizeFavoriteImport } from './favoriteImport'

describe('normalizeFavoriteImport', () => {
  const now = new Date('2026-08-28T00:00:00.000Z')

  it('converts the compatible array format without retaining source-only fields', () => {
    const result = normalizeFavoriteImport([
      { id: 'source-id', name: '稲荷神社', lat: 37.517689, lng: 139.888884, frameStyle: 'retro', createdAt: 1778474358961 },
    ], now)

    expect(result).toEqual({
      isCompatibleFormat: true,
      document: {
        format: 'arcwayfarer-favorites',
        schema_version: 1,
        exported_at: now.toISOString(),
        groups: [],
        favorites: [{
          name: '稲荷神社', lat: 37.517689, lng: 139.888884,
          group: '', notes: '', created_at: 1778474358, order: 0,
        }],
      },
    })
  })

  it('keeps ArcWayfarer documents unchanged', () => {
    const document = { format: 'arcwayfarer-favorites', schema_version: 1, exported_at: '2026-08-27T00:00:00Z', groups: [], favorites: [] } as const
    expect(normalizeFavoriteImport(document, now)).toEqual({ document, isCompatibleFormat: false })
  })

  it('rejects malformed or out-of-range compatible entries', () => {
    expect(normalizeFavoriteImport([{ name: 'Invalid', lat: 91, lng: 121 }], now)).toBeNull()
    expect(normalizeFavoriteImport([{ name: '', lat: 25, lng: 121 }], now)).toBeNull()
  })
})
