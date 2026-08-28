import type { FavoriteExportDocument, FavoriteExportItem } from '../../services/api'

type CompatibleFavorite = {
  name: string
  lat: number
  lng: number
  createdAt?: number
}

export type NormalizedFavoriteImport = {
  document: FavoriteExportDocument
  isCompatibleFormat: boolean
}

function isCompatibleFavorite(value: unknown): value is CompatibleFavorite {
  if (!value || typeof value !== 'object') return false
  const favorite = value as Record<string, unknown>
  return typeof favorite.name === 'string'
    && favorite.name.trim().length > 0
    && favorite.name.trim().length <= 80
    && typeof favorite.lat === 'number'
    && Number.isFinite(favorite.lat)
    && favorite.lat >= -90
    && favorite.lat <= 90
    && typeof favorite.lng === 'number'
    && Number.isFinite(favorite.lng)
    && favorite.lng >= -180
    && favorite.lng <= 180
}

function normalizeCreatedAt(value: unknown, fallbackSeconds: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallbackSeconds
  // The compatible format stores Unix timestamps in milliseconds, whereas
  // ArcWayfarer uses seconds. Accept seconds too for resilient imports.
  return Math.floor(value >= 100_000_000_000 ? value / 1000 : value)
}

/**
 * Accept ArcWayfarer's versioned document and a compatible array format with
 * name, lat, lng, and optional createdAt fields. Unknown source metadata is
 * deliberately not imported.
 */
export function normalizeFavoriteImport(input: unknown, now = new Date()): NormalizedFavoriteImport | null {
  if (input && typeof input === 'object' && !Array.isArray(input) && (input as { format?: unknown }).format === 'arcwayfarer-favorites') {
    return { document: input as FavoriteExportDocument, isCompatibleFormat: false }
  }

  if (!Array.isArray(input) || !input.every(isCompatibleFavorite)) return null

  const fallbackSeconds = Math.floor(now.getTime() / 1000)
  const favorites: FavoriteExportItem[] = input.map((favorite, order) => ({
    name: favorite.name.trim(),
    lat: favorite.lat,
    lng: favorite.lng,
    group: '',
    notes: '',
    created_at: normalizeCreatedAt(favorite.createdAt, fallbackSeconds),
    order,
  }))

  return {
    document: {
      format: 'arcwayfarer-favorites',
      schema_version: 1,
      exported_at: now.toISOString(),
      groups: [],
      favorites,
    },
    isCompatibleFormat: true,
  }
}
