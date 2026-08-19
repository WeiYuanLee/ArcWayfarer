import { useCallback, useEffect, useRef, useState } from 'react'
import { addFavoriteGroup, deleteFavorite, listFavoriteGroups, listFavorites, reorderFavorites, updateFavorite, type Favorite } from '../services/api'

export type SortMode = 'manual' | 'name' | 'date'

type PendingDelete = {
  favorite: Favorite
  timeoutId: ReturnType<typeof setTimeout>
}

function sortFavorites(favorites: Favorite[], mode: SortMode): Favorite[] {
  if (mode === 'name') return [...favorites].sort((a, b) => a.name.localeCompare(b.name))
  if (mode === 'date') return [...favorites].sort((a, b) => b.created_at - a.created_at)
  return [...favorites].sort((a, b) => a.order - b.order)
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [savedGroups, setSavedGroups] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [sortMode, setSortMode] = useState<SortMode>('manual')
  const [search, setSearch] = useState('')
  const [pendingDeletes, setPendingDeletes] = useState<Map<string, PendingDelete>>(new Map())
  const pendingDeletesRef = useRef(pendingDeletes)
  pendingDeletesRef.current = pendingDeletes

  const refresh = useCallback(() => {
    return Promise.all([listFavorites(), listFavoriteGroups()])
      .then(([nextFavorites, nextGroups]) => {
        setFavorites(nextFavorites)
        setSavedGroups(nextGroups)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const displayed = sortFavorites(favorites, sortMode).filter((f) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return f.name.toLowerCase().includes(q) || f.group.toLowerCase().includes(q) || f.notes.toLowerCase().includes(q)
  })

  const allGroups = Array.from(new Set([...savedGroups, ...favorites.map((f) => f.group || '')])).sort((a, b) => {
    if (a === '') return 1
    if (b === '') return -1
    return a.localeCompare(b)
  })
  const groups = !search.trim()
    ? allGroups
    : allGroups.filter((group) => group.toLowerCase().includes(search.toLowerCase()) || displayed.some((favorite) => (favorite.group || '') === group))

  function requestDelete(favorite: Favorite) {
    setFavorites((prev) => prev.filter((f) => f.id !== favorite.id))
    const timeoutId = setTimeout(async () => {
      try {
        await deleteFavorite(favorite.id)
      } catch {
        // Silently ignore — list will self-correct on next open
      }
      setPendingDeletes((prev) => {
        const next = new Map(prev)
        next.delete(favorite.id)
        return next
      })
    }, 3000)
    setPendingDeletes((prev) => new Map(prev).set(favorite.id, { favorite, timeoutId }))
  }

  function undoDelete(id: string) {
    const pending = pendingDeletesRef.current.get(id)
    if (!pending) return
    clearTimeout(pending.timeoutId)
    setPendingDeletes((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    setFavorites((prev) => {
      const exists = prev.some((f) => f.id === id)
      if (exists) return prev
      return sortFavorites([...prev, pending.favorite], 'manual')
    })
  }

  async function handleUpdate(id: string, patch: { name?: string; group?: string; notes?: string }) {
    const updated = await updateFavorite(id, patch)
    setFavorites((prev) => prev.map((f) => (f.id === id ? updated : f)))
    return updated
  }

  async function handleCreateGroup(name: string) {
    const group = await addFavoriteGroup(name)
    setSavedGroups((prev) => Array.from(new Set([...prev, group])).sort((a, b) => a.localeCompare(b)))
    return group
  }

  async function handleReorder(reordered: Favorite[]) {
    const items = reordered.map((f, i) => ({ id: f.id, order: i }))
    setFavorites((prev) => {
      const map = new Map(prev.map((f) => [f.id, f]))
      return reordered.map((f, i) => ({ ...map.get(f.id)!, order: i }))
    })
    try {
      await reorderFavorites(items)
    } catch {
      // Optimistic; will re-sync on next open
    }
  }

  return {
    favorites,
    setFavorites,
    displayed,
    groups,
    loading,
    sortMode,
    setSortMode,
    search,
    setSearch,
    pendingDeletes,
    requestDelete,
    undoDelete,
    handleUpdate,
    handleCreateGroup,
    handleReorder,
    refresh,
  }
}
