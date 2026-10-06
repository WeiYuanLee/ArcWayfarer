import { useEffect } from 'react'
import { getPikminSyncStatus, startPikminSync } from '../services/api'

const STORAGE_KEY = 'arcwayfarer.pikmin.last_successful_sync_at'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function isFresh(value: string | null): boolean {
  if (!value) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && Date.now() - timestamp < MAX_AGE_MS
}

export function usePikminSync() {
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    async function check() {
      const localTimestamp = window.localStorage.getItem(STORAGE_KEY)
      if (isFresh(localTimestamp)) return
      try {
        const current = await getPikminSyncStatus()
        if (isFresh(current.last_successful_sync_at)) {
          window.localStorage.setItem(STORAGE_KEY, current.last_successful_sync_at!)
          return
        }
        let status = current.status === 'running' ? current : await startPikminSync()
        while (!cancelled && status.status === 'running') {
          await new Promise<void>((resolve) => {
            timer = setTimeout(resolve, 1200)
          })
          if (cancelled) return
          status = await getPikminSyncStatus()
        }
        if (!cancelled && status.status === 'success' && status.last_successful_sync_at) {
          window.localStorage.setItem(STORAGE_KEY, status.last_successful_sync_at)
        }
      } catch {
        // Keep the previous successful timestamp. An overdue cache retries next launch.
      }
    }

    void check()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])
}
