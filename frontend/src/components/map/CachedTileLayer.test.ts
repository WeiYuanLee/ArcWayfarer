// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import L from 'leaflet'
import { CachedTileLayer, createCachedTileLayer } from './CachedTileLayer'
import { DEFAULT_TILE_PROVIDER } from '../../types/tileProvider'

describe('CachedTileLayer', () => {
  it('instantiates with provider configuration and namespace', () => {
    const layer = createCachedTileLayer(DEFAULT_TILE_PROVIDER.url, {
      provider: DEFAULT_TILE_PROVIDER,
      attribution: DEFAULT_TILE_PROVIDER.attribution,
      maxZoom: DEFAULT_TILE_PROVIDER.maxZoom,
    })

    expect(layer).toBeInstanceOf(CachedTileLayer)
  })

  it('bypasses cache and loads tile src directly when enableCache is false', () => {
    const layer = createCachedTileLayer('https://tile.example.com/{z}/{x}/{y}.png', {
      enableCache: false,
    })
    ;(layer as any)._tileZoom = 14

    const coords = Object.assign(new L.Point(10, 20), { z: 14 }) as any
    const done = vi.fn()
    const tile = layer.createTile(coords, done) as HTMLImageElement

    expect(tile.src).toContain('14/10/20.png')
  })

  it('safely handles tile removal without throwing errors', () => {
    const layer = createCachedTileLayer('https://tile.example.com/{z}/{x}/{y}.png', {
      cacheNamespace: 'test-osm',
    })
    ;(layer as any)._tileZoom = 10

    const coords = Object.assign(new L.Point(5, 5), { z: 10 }) as any
    const done = vi.fn()
    layer.createTile(coords, done)

    const key = (layer as any)._tileCoordsToKey(coords)
    expect(() => {
      layer._removeTile(key)
    }).not.toThrow()
  })
})
