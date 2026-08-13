import { useEffect, useRef } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useT } from '../../i18n'
import { useFavorites } from '../../hooks/useFavorites'
import { FavoriteGroupSection } from './FavoriteGroupSection'
import { UndoToast } from '../common/UndoToast'
import type { Favorite } from '../../services/api'

type Props = {
  isOpen: boolean
  onClose: () => void
  onSelectFavorite: (lat: number, lng: number) => void
}

export function FavoritesDrawer({ isOpen, onClose, onSelectFavorite }: Props) {
  const t = useT()
  const {
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
    handleReorder,
    refresh,
  } = useFavorites()

  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      refresh()
      setTimeout(() => searchRef.current?.focus(), 80)
    }
  }, [isOpen, refresh])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const allInManualOrder = [...displayed]
    const oldIndex = allInManualOrder.findIndex((f) => f.id === active.id)
    const newIndex = allInManualOrder.findIndex((f) => f.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    void handleReorder(arrayMove(allInManualOrder, oldIndex, newIndex))
  }

  function handleSelect(lat: number, lng: number) {
    onSelectFavorite(lat, lng)
    onClose()
  }

  if (!isOpen) return null

  const totalCount = displayed.length

  return (
    <>
      <div className="fav-drawer-backdrop" onClick={onClose} />
      <aside className="fav-drawer" role="dialog" aria-label={t('favorites.title')}>
        {/* Header */}
        <div className="fav-drawer-header">
          <div className="fav-drawer-title-row">
            <h2 className="fav-drawer-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="fav-drawer-title-icon">
                <path d="M12 20.25s-7-4.24-7-10.16C5 7.81 6.7 6.25 8.86 6.25c1.32 0 2.56.68 3.14 1.72a3.59 3.59 0 0 1 3.14-1.72C17.3 6.25 19 7.81 19 10.09c0 5.92-7 10.16-7 10.16Z" />
                <path d="M12 7.97v8.28" />
              </svg>
              {t('favorites.title')}
            </h2>
            <span className="fav-drawer-count">{totalCount} {t('favorites.count')}</span>
            <button className="fav-drawer-close" onClick={onClose} aria-label={t('favorites.cancel')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Search + Sort */}
          <div className="fav-toolbar">
            <div className="fav-search-wrap">
              <svg className="fav-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                ref={searchRef}
                className="fav-search-input"
                value={search}
                placeholder={t('favorites.search_placeholder')}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button className="fav-search-clear" onClick={() => setSearch('')} aria-label="Clear">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
            <div className="fav-sort-tabs">
              {(['manual', 'name', 'date'] as const).map((mode) => (
                <button
                  key={mode}
                  className={`fav-sort-tab ${sortMode === mode ? 'fav-sort-tab--active' : ''}`}
                  onClick={() => setSortMode(mode)}
                >
                  {t(`favorites.sort.${mode}` as Parameters<typeof t>[0])}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="fav-drawer-body">
          {loading && <p className="fav-hint">{t('generic.working')}</p>}
          {!loading && displayed.length === 0 && (
            <p className="fav-hint">{search ? t('favorites.empty_search') : t('favorites.empty')}</p>
          )}
          {!loading && displayed.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              {groups.map((groupName) => {
                const items = displayed.filter((f) => (f.group || '') === groupName)
                if (items.length === 0) return null
                return (
                  <FavoriteGroupSection
                    key={groupName}
                    groupName={groupName}
                    items={items}
                    sortMode={sortMode}
                    allGroups={groups}
                    onSelect={handleSelect}
                    onUpdate={handleUpdate}
                    onDelete={(fav: Favorite) => requestDelete(fav)}
                  />
                )
              })}
            </DndContext>
          )}
        </div>
      </aside>

      <UndoToast pendingDeletes={pendingDeletes} onUndo={undoDelete} />
    </>
  )
}
