import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useT } from '../../i18n'
import type { Favorite } from '../../services/api'

type Props = {
  favorite: Favorite
  sortMode: 'manual' | 'name' | 'date'
  groups: string[]
  onSelect: (lat: number, lng: number) => void
  onUpdate: (id: string, patch: { name?: string; group?: string; notes?: string }) => Promise<Favorite>
  onDelete: (favorite: Favorite) => void
}

export function FavoriteItem({ favorite, sortMode, groups, onSelect, onUpdate, onDelete }: Props) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(favorite.name)
  const [group, setGroup] = useState(favorite.group)
  const [notes, setNotes] = useState(favorite.notes)
  const [saving, setSaving] = useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: favorite.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onUpdate(favorite.id, { name: name.trim(), group: group.trim(), notes: notes.trim() })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <li ref={setNodeRef} style={style} className="fav-item fav-item--editing">
        <div className="fav-edit-form">
          <label className="fav-edit-label">{t('favorites.rename')}</label>
          <input
            className="fav-edit-input"
            value={name}
            maxLength={80}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleSave(); if (e.key === 'Escape') setEditing(false) }}
          />
          <label className="fav-edit-label">{t('favorites.new_group')}</label>
          <input
            className="fav-edit-input"
            value={group}
            maxLength={40}
            placeholder={t('favorites.group_placeholder')}
            list="fav-groups-list"
            onChange={(e) => setGroup(e.target.value)}
          />
          <datalist id="fav-groups-list">
            {groups.filter(Boolean).map((g) => <option key={g} value={g} />)}
          </datalist>
          <label className="fav-edit-label">{t('favorites.notes_placeholder')}</label>
          <textarea
            className="fav-edit-textarea"
            value={notes}
            maxLength={200}
            placeholder={t('favorites.notes_placeholder')}
            rows={2}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="fav-edit-actions">
            <button className="fav-btn fav-btn--ghost" onClick={() => setEditing(false)} disabled={saving}>
              {t('favorites.cancel')}
            </button>
            <button className="fav-btn fav-btn--primary" onClick={() => void handleSave()} disabled={saving || !name.trim()}>
              {t('favorites.save')}
            </button>
          </div>
        </div>
      </li>
    )
  }

  return (
    <li ref={setNodeRef} style={style} className="fav-item">
      {sortMode === 'manual' && (
        <button className="fav-drag-handle" title={t('favorites.drag_hint')} {...attributes} {...listeners}>
          <svg width="14" height="20" viewBox="0 0 14 20" fill="none">
            <circle cx="4" cy="4" r="1.5" fill="currentColor" />
            <circle cx="10" cy="4" r="1.5" fill="currentColor" />
            <circle cx="4" cy="10" r="1.5" fill="currentColor" />
            <circle cx="10" cy="10" r="1.5" fill="currentColor" />
            <circle cx="4" cy="16" r="1.5" fill="currentColor" />
            <circle cx="10" cy="16" r="1.5" fill="currentColor" />
          </svg>
        </button>
      )}
      <button className="fav-main" onClick={() => onSelect(favorite.lat, favorite.lng)}>
        <span className="fav-name">{favorite.name}</span>
        {favorite.notes && <span className="fav-notes">{favorite.notes}</span>}
        <span className="fav-coords">{favorite.lat.toFixed(5)}, {favorite.lng.toFixed(5)}</span>
      </button>
      <div className="fav-actions">
        <button
          className="fav-action-btn"
          title={t('favorites.rename')}
          onClick={() => { setName(favorite.name); setGroup(favorite.group); setNotes(favorite.notes); setEditing(true) }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button
          className="fav-action-btn fav-action-btn--danger"
          title={t('favorites.delete')}
          onClick={() => onDelete(favorite)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>
    </li>
  )
}
