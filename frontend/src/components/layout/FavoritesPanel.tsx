import { useEffect, useState } from 'react'
import { deleteFavorite, listFavorites, type Favorite } from '../../services/api'
import { useT } from '../../i18n'

type Props = {
  onFlyTo: (lat: number, lng: number) => void
}

export function FavoritesPanel({ onFlyTo }: Props) {
  const t = useT()
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="flyout-content">
      <h2>{t('favorites.title')}</h2>
      {loading && <p className="panel-hint">{t('generic.working')}</p>}
      {!loading && favorites.length === 0 && <p className="panel-hint">{t('favorites.empty')}</p>}
      <ul className="flyout-list">
        {favorites.map((favorite) => (
          <li key={favorite.id}>
            <button className="flyout-item" onClick={() => onFlyTo(favorite.lat, favorite.lng)}>
              <span className="flyout-item-name">{favorite.name}</span>
              <span className="flyout-item-time">
                {favorite.lat.toFixed(4)}, {favorite.lng.toFixed(4)}
              </span>
            </button>
            <button className="flyout-item-delete" onClick={() => handleDelete(favorite.id)} title={t('favorites.delete')}>
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
