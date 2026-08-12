import { useState } from 'react'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useT } from '../../i18n'
import type { Favorite } from '../../services/api'
import { FavoriteItem } from './FavoriteItem'
import type { SortMode } from '../../hooks/useFavorites'

type Props = {
  groupName: string
  items: Favorite[]
  sortMode: SortMode
  allGroups: string[]
  onSelect: (lat: number, lng: number) => void
  onUpdate: (id: string, patch: { name?: string; group?: string; notes?: string }) => Promise<Favorite>
  onDelete: (favorite: Favorite) => void
}

export function FavoriteGroupSection({ groupName, items, sortMode, allGroups, onSelect, onUpdate, onDelete }: Props) {
  const t = useT()
  const [collapsed, setCollapsed] = useState(false)
  const label = groupName || t('favorites.ungrouped')

  return (
    <div className="fav-group">
      <button className="fav-group-header" onClick={() => setCollapsed((v) => !v)}>
        <svg
          className={`fav-group-chevron ${collapsed ? '' : 'fav-group-chevron--open'}`}
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span className="fav-group-label">{label}</span>
        <span className="fav-group-count">{items.length}</span>
      </button>

      {!collapsed && (
        <SortableContext items={items.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <ul className="fav-list">
            {items.map((f) => (
              <FavoriteItem
                key={f.id}
                favorite={f}
                sortMode={sortMode}
                groups={allGroups}
                onSelect={onSelect}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            ))}
          </ul>
        </SortableContext>
      )}
    </div>
  )
}
