import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getCachedTile,
  saveCachedTile,
  clearTileCache,
  getTileCacheStats,
  pruneLruTiles,
} from './tileCacheService'

describe('tileCacheService (IndexedDB)', () => {
  beforeEach(async () => {
    await clearTileCache()
  })

  it('saves and retrieves a tile from IndexedDB cache', async () => {
    const tileKey = 'osm:14:100:200'
    const tileUrl = 'https://tile.openstreetmap.org/14/100/200.png'
    const blob = new Blob(['mock-tile-content-png'], { type: 'image/png' })

    await saveCachedTile(tileKey, tileUrl, blob)

    const cached = await getCachedTile(tileKey)
    expect(cached).not.toBeNull()
    expect(cached?.size).toBe(blob.size)
  })

  it('isolates cache keys across different provider namespaces', async () => {
    const osmKey = 'osm:14:50:50'
    const cartoKey = 'carto:14:50:50'
    const osmBlob = new Blob(['osm-tile-image'], { type: 'image/png' })
    const cartoBlob = new Blob(['carto-tile-image-distinct-bytes'], { type: 'image/png' })

    await saveCachedTile(osmKey, 'https://tile.osm.org/14/50/50.png', osmBlob)
    await saveCachedTile(cartoKey, 'https://carto.com/14/50/50.png', cartoBlob)

    const cachedOsm = await getCachedTile(osmKey)
    const cachedCarto = await getCachedTile(cartoKey)

    expect(cachedOsm).not.toBeNull()
    expect(cachedCarto).not.toBeNull()
    expect(cachedOsm?.size).toBe(osmBlob.size)
    expect(cachedCarto?.size).toBe(cartoBlob.size)
    expect(cachedOsm?.size).not.toBe(cachedCarto?.size)
  })

  it('returns null for non-existent tile', async () => {
    const cached = await getCachedTile('non-existent-tile')
    expect(cached).toBeNull()
  })

  it('expires tiles exceeding TTL in IndexedDB', async () => {
    const tileKey = 'osm-expired:14:100:200'
    const tileUrl = 'https://tile.openstreetmap.org/14/100/200.png'
    const blob = new Blob(['mock-expired-tile'], { type: 'image/png' })

    await saveCachedTile(tileKey, tileUrl, blob)

    // Query with 0 ms TTL (immediately expired)
    const cached = await getCachedTile(tileKey, 0)
    expect(cached).toBeNull()
  })

  it('enforces target storage budget via cursor-based LRU pruning in IndexedDB', async () => {
    const smallBudgetConfig = {
      maxSizeBytes: 50, // 50 bytes maximum target budget
      ttlMs: 14 * 86400 * 1000,
      pruneBatchBytes: 25,
    }

    const blob1 = new Blob(['12345678901234567890'], { type: 'image/png' }) // 20 bytes
    const blob2 = new Blob(['12345678901234567890'], { type: 'image/png' }) // 20 bytes
    const blob3 = new Blob(['12345678901234567890'], { type: 'image/png' }) // 20 bytes -> total 60 bytes (exceeds 50)

    await saveCachedTile('t1', 'url1', blob1, smallBudgetConfig)
    await saveCachedTile('t2', 'url2', blob2, smallBudgetConfig)
    await saveCachedTile('t3', 'url3', blob3, smallBudgetConfig)

    const stats = await getTileCacheStats()
    // Storage budget is immediately pruned post-write down to safe watermark
    expect(stats.totalBytes).toBeLessThanOrEqual(50)
  })

  it('tracks cache statistics and calculates total bytes correctly in IndexedDB', async () => {
    const blob1 = new Blob(['tile-1-data'], { type: 'image/png' })
    const blob2 = new Blob(['tile-2-data-longer'], { type: 'image/png' })

    await saveCachedTile('t1', 'url1', blob1)
    await saveCachedTile('t2', 'url2', blob2)

    const stats = await getTileCacheStats()
    expect(stats.count).toBe(2)
    expect(stats.totalBytes).toBe(blob1.size + blob2.size)
  })

  it('clears all cached tiles from IndexedDB upon request', async () => {
    const blob = new Blob(['tile-data'], { type: 'image/png' })
    await saveCachedTile('t1', 'url1', blob)

    await clearTileCache()

    const stats = await getTileCacheStats()
    expect(stats.count).toBe(0)
    expect(stats.totalBytes).toBe(0)
  })
})
