/**
 * Bounded LRU Map Tile Cache with TTL.
 *
 * Implements a managed local tile cache for Leaflet:
 * - Uses IndexedDB for persistent storage across sessions in Electron and browsers.
 * - Gracefully falls back to an in-memory LRU cache if IndexedDB is unavailable.
 * - Only passively caches tiles requested by the user during normal map usage.
 * - Enforces a maximum storage budget (e.g., 200 MB) with LRU eviction.
 * - Enforces Time-To-Live (TTL, e.g., 14 days) to prevent stale map data.
 */

export interface CacheConfig {
  maxSizeBytes: number
  ttlMs: number
  pruneBatchBytes: number
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSizeBytes: 200 * 1024 * 1024, // 200 MB maximum cache budget
  ttlMs: 14 * 24 * 60 * 60 * 1000,   // 14 days expiration
  pruneBatchBytes: 20 * 1024 * 1024, // Evict 20 MB when exceeding limit
}

export interface CachedTileRecord {
  key: string
  url: string
  blob: Blob
  size: number
  timestamp: number
  lastAccessed: number
}

const DB_NAME = 'arcwayfarer-map-tile-cache'
const DB_VERSION = 1
const STORE_TILES = 'tiles'
const STORE_META = 'metadata'
const META_KEY_TOTAL_SIZE = 'total_size'

// In-memory fallback cache when IndexedDB is unavailable
class InMemoryTileCache {
  private tiles = new Map<string, CachedTileRecord>()
  private totalBytes = 0

  async getTile(key: string, ttlMs: number): Promise<Blob | null> {
    const record = this.tiles.get(key)
    if (!record) return null
    const now = Date.now()
    if (now - record.timestamp >= ttlMs) {
      this.tiles.delete(key)
      this.totalBytes = Math.max(0, this.totalBytes - record.size)
      return null
    }
    record.lastAccessed = now
    return record.blob
  }

  async saveTile(record: CachedTileRecord, config: CacheConfig): Promise<void> {
    const prev = this.tiles.get(record.key)
    if (prev) {
      this.totalBytes -= prev.size
    }
    this.tiles.set(record.key, record)
    this.totalBytes += record.size

    if (this.totalBytes > config.maxSizeBytes) {
      await this.prune(config.maxSizeBytes - config.pruneBatchBytes)
    }
  }

  async deleteTile(key: string): Promise<void> {
    const prev = this.tiles.get(key)
    if (prev) {
      this.tiles.delete(key)
      this.totalBytes = Math.max(0, this.totalBytes - prev.size)
    }
  }

  async prune(targetBytes: number): Promise<number> {
    if (this.totalBytes <= targetBytes) return 0
    const sorted = Array.from(this.tiles.values()).sort((a, b) => a.lastAccessed - b.lastAccessed)
    let deletedCount = 0
    for (const record of sorted) {
      if (this.totalBytes <= targetBytes) break
      this.tiles.delete(record.key)
      this.totalBytes = Math.max(0, this.totalBytes - record.size)
      deletedCount++
    }
    return deletedCount
  }

  async clear(): Promise<void> {
    this.tiles.clear()
    this.totalBytes = 0
  }

  async getStats(): Promise<{ count: number; totalBytes: number }> {
    return { count: this.tiles.size, totalBytes: this.totalBytes }
  }
}

const memoryFallback = new InMemoryTileCache()
let isIndexedDbAvailable: boolean | null = null
let dbPromise: Promise<IDBDatabase> | null = null

function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null
}

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!hasIndexedDB()) {
      isIndexedDbAvailable = false
      return reject(new Error('IndexedDB not supported'))
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = () => {
        const db = request.result

        if (!db.objectStoreNames.contains(STORE_TILES)) {
          const store = db.createObjectStore(STORE_TILES, { keyPath: 'key' })
          store.createIndex('lastAccessed', 'lastAccessed', { unique: false })
          store.createIndex('timestamp', 'timestamp', { unique: false })
        }

        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META)
        }
      }

      request.onsuccess = () => {
        isIndexedDbAvailable = true
        resolve(request.result)
      }

      request.onerror = () => {
        isIndexedDbAvailable = false
        dbPromise = null
        reject(request.error)
      }
    } catch (e) {
      isIndexedDbAvailable = false
      dbPromise = null
      reject(e)
    }
  })

  return dbPromise
}

/**
 * Retrieves total cached size in bytes.
 */
export async function getTotalCacheSize(): Promise<number> {
  try {
    const db = await openDatabase()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_META, 'readonly')
      const store = tx.objectStore(STORE_META)
      const req = store.get(META_KEY_TOTAL_SIZE)
      req.onsuccess = () => resolve(typeof req.result === 'number' ? req.result : 0)
      req.onerror = () => resolve(0)
    })
  } catch {
    const stats = await memoryFallback.getStats()
    return stats.totalBytes
  }
}

/**
 * Look up a tile in the local cache.
 * Returns the cached Blob if found and unexpired, otherwise null.
 */
export async function getCachedTile(
  key: string,
  ttlMs = DEFAULT_CACHE_CONFIG.ttlMs
): Promise<Blob | null> {
  try {
    const db = await openDatabase()
    const record = await new Promise<CachedTileRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_TILES, 'readonly')
      const store = tx.objectStore(STORE_TILES)
      const req = store.get(key)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    if (!record) return null

    const now = Date.now()
    // Check TTL expiration
    if (now - record.timestamp >= ttlMs) {
      deleteCachedTile(key).catch(() => {})
      return null
    }

    // Touch lastAccessed for LRU ordering
    touchTileAccess(db, key, now).catch(() => {})

    return record.blob
  } catch {
    return memoryFallback.getTile(key, ttlMs)
  }
}

/**
 * Updates the lastAccessed timestamp of a tile for LRU tracking.
 */
async function touchTileAccess(db: IDBDatabase, key: string, timestamp: number): Promise<void> {
  try {
    const tx = db.transaction(STORE_TILES, 'readwrite')
    const store = tx.objectStore(STORE_TILES)
    const getReq = store.get(key)
    getReq.onsuccess = () => {
      const item = getReq.result as CachedTileRecord | undefined
      if (item) {
        item.lastAccessed = timestamp
        store.put(item)
      }
    }
  } catch {
    // Ignore touch failures
  }
}

/**
 * Saves a downloaded tile blob into the cache and enforces LRU budget limits.
 */
export async function saveCachedTile(
  key: string,
  url: string,
  blob: Blob,
  config: CacheConfig = DEFAULT_CACHE_CONFIG
): Promise<void> {
  const size = blob.size || 0
  const now = Date.now()

  const record: CachedTileRecord = {
    key,
    url,
    blob,
    size,
    timestamp: now,
    lastAccessed: now,
  }

  try {
    const db = await openDatabase()

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_TILES, STORE_META], 'readwrite')
      const tileStore = tx.objectStore(STORE_TILES)
      const metaStore = tx.objectStore(STORE_META)

      const checkReq = tileStore.get(key)
      checkReq.onsuccess = () => {
        const existing = checkReq.result as CachedTileRecord | undefined
        const prevSize = existing ? existing.size : 0

        tileStore.put(record)

        const metaReq = metaStore.get(META_KEY_TOTAL_SIZE)
        metaReq.onsuccess = () => {
          const currentTotal = typeof metaReq.result === 'number' ? metaReq.result : 0
          const newTotal = currentTotal - prevSize + size
          metaStore.put(newTotal, META_KEY_TOTAL_SIZE)
        }
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    const currentSize = await getTotalCacheSize()
    if (currentSize > config.maxSizeBytes) {
      await pruneLruTiles(config.maxSizeBytes - config.pruneBatchBytes)
    }
  } catch {
    await memoryFallback.saveTile(record, config)
  }
}

/**
 * Deletes a single tile from cache.
 */
export async function deleteCachedTile(key: string): Promise<void> {
  try {
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_TILES, STORE_META], 'readwrite')
      const tileStore = tx.objectStore(STORE_TILES)
      const metaStore = tx.objectStore(STORE_META)

      const getReq = tileStore.get(key)
      getReq.onsuccess = () => {
        const item = getReq.result as CachedTileRecord | undefined
        if (item) {
          tileStore.delete(key)
          const metaReq = metaStore.get(META_KEY_TOTAL_SIZE)
          metaReq.onsuccess = () => {
            const currentTotal = typeof metaReq.result === 'number' ? metaReq.result : 0
            metaStore.put(Math.max(0, currentTotal - item.size), META_KEY_TOTAL_SIZE)
          }
        }
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    await memoryFallback.deleteTile(key)
  }
}

/**
 * Prunes oldest accessed tiles until total size drops below targetBytes.
 */
export async function pruneLruTiles(targetBytes: number): Promise<number> {
  try {
    const db = await openDatabase()
    let currentTotal = await getTotalCacheSize()
    if (currentTotal <= targetBytes) return 0

    return new Promise<number>((resolve) => {
      const tx = db.transaction([STORE_TILES, STORE_META], 'readwrite')
      const tileStore = tx.objectStore(STORE_TILES)
      const metaStore = tx.objectStore(STORE_META)
      const index = tileStore.index('lastAccessed')
      const cursorReq = index.openCursor()

      let deletedBytes = 0
      let deletedCount = 0

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (cursor && currentTotal - deletedBytes > targetBytes) {
          const item = cursor.value as CachedTileRecord
          deletedBytes += item.size
          deletedCount++
          cursor.delete()
          cursor.continue()
        } else {
          const newSize = Math.max(0, currentTotal - deletedBytes)
          metaStore.put(newSize, META_KEY_TOTAL_SIZE)
        }
      }

      tx.oncomplete = () => resolve(deletedCount)
      tx.onerror = () => resolve(deletedCount)
    })
  } catch {
    return memoryFallback.prune(targetBytes)
  }
}

/**
 * Clears all cached tiles and resets metadata.
 */
export async function clearTileCache(): Promise<void> {
  try {
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_TILES, STORE_META], 'readwrite')
      tx.objectStore(STORE_TILES).clear()
      tx.objectStore(STORE_META).put(0, META_KEY_TOTAL_SIZE)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    await memoryFallback.clear()
  }
}

/**
 * Returns cache statistics (tile count and total byte size).
 */
export async function getTileCacheStats(): Promise<{ count: number; totalBytes: number }> {
  try {
    const db = await openDatabase()
    const [count, totalBytes] = await Promise.all([
      new Promise<number>((resolve) => {
        const tx = db.transaction(STORE_TILES, 'readonly')
        const req = tx.objectStore(STORE_TILES).count()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(0)
      }),
      getTotalCacheSize(),
    ])
    return { count, totalBytes }
  } catch {
    return memoryFallback.getStats()
  }
}
