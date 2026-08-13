import { useState } from 'react'
import { FavoritesDrawer } from './FavoritesDrawer'
import { HistoryDrawer } from './HistoryDrawer'
import { useT } from '../../i18n'

type Props = {
  onFlyTo: (lat: number, lng: number) => void
  onSelectFavorite: (lat: number, lng: number) => void
}

export function IconRail({ onFlyTo, onSelectFavorite }: Props) {
  const t = useT()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [favDrawerOpen, setFavDrawerOpen] = useState(false)

  return (
    <>
      <div className="icon-rail">
        <button
          className={`map-action-button history-action${historyOpen ? ' active' : ''}`}
          onClick={() => setHistoryOpen(true)}
          title={t('history.title')}
          aria-label={t('history.title')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3.5 12a8.5 8.5 0 1 0 2.49-6.01L3.5 8.5" />
            <path d="M3.5 4.5v4h4" />
            <path d="M12 7v5l3.5 2" />
          </svg>
        </button>
        <button
          className={`map-action-button favorites-action${favDrawerOpen ? ' active' : ''}`}
          onClick={() => setFavDrawerOpen(true)}
          title={t('favorites.title')}
          aria-label={t('favorites.title')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 20.25s-7-4.24-7-10.16C5 7.81 6.7 6.25 8.86 6.25c1.32 0 2.56.68 3.14 1.72a3.59 3.59 0 0 1 3.14-1.72C17.3 6.25 19 7.81 19 10.09c0 5.92-7 10.16-7 10.16Z" />
            <path d="M12 7.97v8.28" />
          </svg>
        </button>
      </div>

      <HistoryDrawer
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onFlyTo={onFlyTo}
      />

      <FavoritesDrawer
        isOpen={favDrawerOpen}
        onClose={() => setFavDrawerOpen(false)}
        onSelectFavorite={onSelectFavorite}
      />
    </>
  )
}
