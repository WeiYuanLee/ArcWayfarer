/**
 * Two-Tier Bounded LRU Map Tile Cache with TTL.
 *
 * Architecture:
 * - Tier 1 (L1 RAM Cache): In-memory LRU cache of up to 120 most recently used tiles (0ms instant lookup).
 * - Tier 2 (L2 Disk Cache): IndexedDB persistent storage with 200 MB budget and 14-day TTL.
 * - Graceful fallback: If IndexedDB is unavailable, operates seamlessly via in-memory storage.
 */

export interface CacheConfig {
  maxSizeBytes: number
  ttlMs: number
  pruneBatchBytes: number
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSizeBytes: 200 * 1024 * 1024, // 200 MB target cache budget
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

// ==========================================
// Tier 1 (L1): In-Memory Fast LRU Cache
// ==========================================
interface L1CacheEntry {
  blob: Blob
  timestamp: number
  lastAccessed: number
}

class L1MemoryTileCache {
  private cache = new Map<string, L1CacheEntry>()
  private maxEntries: number

  constructor(maxEntries = 120) {
    this.maxEntries = maxEntries
  }

  get(key: string, ttlMs: number): Blob | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    const now = Date.now()
    if (now - entry.timestamp >= ttlMs) {
      this.cache.delete(key)
      return null
    }
    entry.lastAccessed = now
    // Re-insert to maintain LRU order in Map iteration
    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.blob
  }

  set(key: string, blob: Blob, timestamp = Date.now()): void {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }
    this.cache.set(key, { blob, timestamp, lastAccessed: Date.now() })
  }

  delete(key: string): void {
    this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}

const l1MemoryCache = new L1MemoryTileCache(120)

// ==========================================
// Fallback In-Memory Engine when IndexedDB is unavailable
// ==========================================
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
 * Look up a tile across the Two-Tier cache (L1 RAM -> L2 IndexedDB).
 * Returns the cached Blob if found and unexpired, otherwise null.
 */
export async function getCachedTile(
  key: string,
  ttlMs = DEFAULT_CACHE_CONFIG.ttlMs
): Promise<Blob | null> {
  // 1. Check L1 In-Memory RAM cache (0ms instant lookup)
  const l1Blob = l1MemoryCache.get(key, ttlMs)
  if (l1Blob) {
    return l1Blob
  }

  // 2. Check L2 IndexedDB persistent disk cache
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

    // Promote to L1 RAM cache
    l1MemoryCache.set(key, record.blob, record.timestamp)

    return record.blob
  } catch {
    const fallbackBlob = await memoryFallback.getTile(key, ttlMs)
    if (fallbackBlob) {
      l1MemoryCache.set(key, fallbackBlob)
    }
    return fallbackBlob
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
 * Saves a downloaded tile blob into L1 RAM and L2 IndexedDB cache.
 */
export async function saveCachedTile(
  key: string,
  url: string,
  blob: Blob,
  config: CacheConfig = DEFAULT_CACHE_CONFIG
): Promise<void> {
  // Never save empty blobs or non-image payloads into cache
  if (!blob || blob.size <= 0) return
  if (blob.type && !blob.type.startsWith('image/')) return

  const size = blob.size || 0
  const now = Date.now()

  // 1. Immediately store in Tier 1 (L1 RAM Cache) for 0ms subsequent lookups
  l1MemoryCache.set(key, blob, now)

  const record: CachedTileRecord = {
    key,
    url,
    blob,
    size,
    timestamp: now,
    lastAccessed: now,
  }

  // 2. Persist to Tier 2 (L2 IndexedDB)
  try {
    const db = await openDatabase()

    let needPrune = false
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
          if (newTotal > config.maxSizeBytes) {
            needPrune = true
          }
        }
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    if (needPrune) {
      await pruneLruTiles(config.maxSizeBytes - config.pruneBatchBytes)
    }
  } catch {
    await memoryFallback.saveTile(record, config)
  }
}

/**
 * Deletes a single tile from cache (both L1 RAM and L2 IndexedDB).
 */
export async function deleteCachedTile(key: string): Promise<void> {
  l1MemoryCache.delete(key)
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
 * Clears all cached tiles from both L1 RAM and L2 IndexedDB.
 */
export async function clearTileCache(): Promise<void> {
  l1MemoryCache.clear()
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
