import { useEffect, useState } from 'react'
import { deleteFavorite, listFavorites, updateFavorite, type Favorite } from '../../services/api'
import { useT } from '../../i18n'

type Props = {
  onSelectFavorite: (lat: number, lng: number) => void
}

export function FavoritesPanel({ onSelectFavorite }: Props) {
  const t = useT()
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  useEffect(() => {
    listFavorites()
      .then(setFavorites)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleDelete(id: string) {
    setFavorites((prev) => prev.filter((f) => f.id !== id))
    try {
      await deleteFavorite(id)
    } catch {
      // ignore, list will self-correct next time the panel is opened
    }
  }

  function beginRename(favorite: Favorite) {
    setEditingId(favorite.id)
    setEditingName(favorite.name)
  }

  async function handleRename(favorite: Favorite) {
    const name = editingName.trim()
    if (!name) return
    try {
      const updated = await updateFavorite(favorite.id, { name })
      setFavorites((prev) => prev.map((item) => item.id === updated.id ? updated : item))
      setEditingId(null)
    } catch {
      // Keep the input open so the user can retry.
    }
  }

  return (
    <div className="flyout-content">
      <h2>{t('favorites.title')}</h2>
      {loading && <p className="panel-hint">{t('generic.working')}</p>}
      {!loading && favorites.length === 0 && <p className="panel-hint">{t('favorites.empty')}</p>}
      <ul className="flyout-list">
        {favorites.map((favorite) => (
          <li key={favorite.id}>
            {editingId === favorite.id ? (
              <form className="favorite-edit-form" onSubmit={(event) => { event.preventDefault(); void handleRename(favorite) }}>
                <input value={editingName} maxLength={80} onChange={(event) => setEditingName(event.target.value)} aria-label={t('favorites.name_placeholder')} autoFocus />
                <button type="submit" title={t('favorites.save')} disabled={!editingName.trim()}>✓</button>
                <button type="button" title={t('favorites.cancel')} onClick={() => setEditingId(null)}>×</button>
              </form>
            ) : (
              <>
                <button className="flyout-item" onClick={() => onSelectFavorite(favorite.lat, favorite.lng)}>
                  <span className="flyout-item-name">{favorite.name}</span>
                  <span className="flyout-item-time">
                    {favorite.lat.toFixed(4)}, {favorite.lng.toFixed(4)}
                  </span>
                </button>
                <button className="flyout-item-edit" onClick={() => beginRename(favorite)} title={t('favorites.rename')}>✎</button>
                <button className="flyout-item-delete" onClick={() => handleDelete(favorite.id)} title={t('favorites.delete')}>
                  ✕
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
