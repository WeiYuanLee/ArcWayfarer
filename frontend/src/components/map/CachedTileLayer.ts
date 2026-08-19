import L from 'leaflet'
import { getCachedTile, saveCachedTile } from '../../services/tileCacheService'
import type { TileProviderConfig } from '../../types/tileProvider'

export interface CachedTileLayerOptions extends L.TileLayerOptions {
  provider?: TileProviderConfig
  cacheNamespace?: string
  enableCache?: boolean
  ttlMs?: number
}

interface PendingTileHandle {
  abortController: AbortController
  objectUrl: string | null
  isRemoved: boolean
}

/**
 * Custom Leaflet TileLayer that routes requested tiles through a Bounded LRU IndexedDB cache.
 *
 * Key safety & lifecycle guarantees:
 * 1. Supports cacheNamespace to prevent cross-provider tile collision when switching providers.
 * 2. Uses AbortController to abort in-flight fetch requests when tiles leave the viewport.
 * 3. Safely manages and revokes ObjectURLs on tile removal to prevent memory leaks.
 * 4. Respects `enableCache` and `ttlMs` configuration flags.
 * 5. Falls back to direct image loading on network / CORS failure.
 */
export class CachedTileLayer extends L.TileLayer {
  private activeTiles = new Map<string, PendingTileHandle>()
  private cacheNamespace: string
  private isCacheEnabled: boolean
  private customTtlMs?: number

  constructor(urlTemplate: string, options?: CachedTileLayerOptions) {
    super(urlTemplate, options)
    if (!this.options.subdomains) {
      this.options.subdomains = 'abc'
    }
    this.cacheNamespace = options?.cacheNamespace || options?.provider?.cacheNamespace || 'osm'
    this.isCacheEnabled = options?.enableCache !== false
    this.customTtlMs = options?.ttlMs
  }

  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tile = document.createElement('img')

    L.DomEvent.on(tile, 'load', L.Util.bind((this as any)._tileOnLoad, this, done, tile))
    L.DomEvent.on(tile, 'error', L.Util.bind((this as any)._tileOnError, this, done, tile))

    if (this.options.crossOrigin || this.options.crossOrigin === '') {
      tile.crossOrigin = this.options.crossOrigin === true ? '' : this.options.crossOrigin
    }

    tile.alt = ''
    tile.setAttribute('role', 'presentation')

    const tileUrl = this.getTileUrl(coords)
    const tileCoordKey = (this as any)._tileCoordsToKey(coords)
    const tileCacheKey = `${this.cacheNamespace}:${coords.z}:${coords.x}:${coords.y}`

    // If cache is explicitly disabled, directly load via browser image src
    if (!this.isCacheEnabled) {
      tile.src = tileUrl
      return tile
    }

    const abortController = new AbortController()
    const handle: PendingTileHandle = {
      abortController,
      objectUrl: null,
      isRemoved: false,
    }
    this.activeTiles.set(tileCoordKey, handle)

    getCachedTile(tileCacheKey, this.customTtlMs)
      .then((blob) => {
        if (handle.isRemoved) return

        if (blob) {
          // Cache hit: instant local load
          const objectUrl = URL.createObjectURL(blob)
          handle.objectUrl = objectUrl
          tile.src = objectUrl
        } else {
          // Cache miss: fetch from network with AbortSignal
          fetch(tileUrl, { signal: abortController.signal })
            .then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`)
              const contentType = res.headers.get('content-type') || ''
              if (contentType && !contentType.includes('image/')) {
                throw new Error(`Invalid content-type: ${contentType}`)
              }
              return res.blob()
            })
            .then((newBlob) => {
              if (handle.isRemoved) return
              if (!newBlob || newBlob.size === 0) return
              saveCachedTile(tileCacheKey, tileUrl, newBlob).catch(() => {})
              const objectUrl = URL.createObjectURL(newBlob)
              handle.objectUrl = objectUrl
              tile.src = objectUrl
            })
            .catch((err) => {
              if (handle.isRemoved) return
              // On abort or fetch failure, fallback to native image loading
              if (err.name !== 'AbortError') {
                tile.src = tileUrl
              }
            })
        }
      })
      .catch(() => {
        if (!handle.isRemoved) {
          tile.src = tileUrl
        }
      })

    return tile
  }

  _removeTile(key: string): void {
    const handle = this.activeTiles.get(key)
    if (handle) {
      handle.isRemoved = true
      handle.abortController.abort()
      if (handle.objectUrl) {
        URL.revokeObjectURL(handle.objectUrl)
        handle.objectUrl = null
      }
      this.activeTiles.delete(key)
    }

    if ((this as any)._tiles) {
      ;(L.TileLayer.prototype as any)._removeTile?.call(this, key)
    }
  }

  onRemove(map: L.Map): this {
    for (const handle of this.activeTiles.values()) {
      handle.isRemoved = true
      handle.abortController.abort()
      if (handle.objectUrl) {
        URL.revokeObjectURL(handle.objectUrl)
      }
    }
    this.activeTiles.clear()
    return super.onRemove(map)
  }
}

/**
 * Factory function for creating a CachedTileLayer instance.
 */
export function createCachedTileLayer(
  urlTemplate: string,
  options?: CachedTileLayerOptions
): CachedTileLayer {
  return new CachedTileLayer(urlTemplate, options)
}
