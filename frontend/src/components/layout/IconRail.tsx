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
          className={historyOpen ? 'active' : ''}
          onClick={() => setHistoryOpen(true)}
          title={t('history.title')}
        >
          🕒
        </button>
        <button
          className={favDrawerOpen ? 'active' : ''}
          onClick={() => setFavDrawerOpen(true)}
          title={t('favorites.title')}
        >
          ⭐
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
