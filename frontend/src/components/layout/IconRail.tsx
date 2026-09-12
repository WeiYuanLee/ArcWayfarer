import { lazy, memo, Suspense, useState } from 'react'
import { Tooltip } from '@mantine/core'
import { IconHeart, IconHistory, IconSearch } from '@tabler/icons-react'
import { useT } from '../../i18n'
import { MapControlButton } from '../map/MapControlButton'

const FavoritesDrawer = lazy(() => import('./FavoritesDrawer').then((module) => ({ default: module.FavoritesDrawer })))
const HistoryDrawer = lazy(() => import('./HistoryDrawer').then((module) => ({ default: module.HistoryDrawer })))
const PlaceSearchDrawer = lazy(() => import('../map/PlaceSearchDrawer').then((module) => ({ default: module.PlaceSearchDrawer })))

type Props = {
  onFlyTo: (lat: number, lng: number) => void
  onSelectFavorite: (lat: number, lng: number) => void
  onSelectPlace: (lat: number, lng: number, placeName: string) => void
}

export const IconRail = memo(function IconRail({ onFlyTo, onSelectFavorite, onSelectPlace }: Props) {
  const t = useT()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [favDrawerOpen, setFavDrawerOpen] = useState(false)
  const [placeSearchOpen, setPlaceSearchOpen] = useState(false)
  const [loadedDrawers, setLoadedDrawers] = useState({ history: false, favorites: false, search: false })

  return (
    <>
      <div className="icon-rail">
        <Tooltip label={t('history.title')} position="left" openDelay={450}>
        <MapControlButton
          className={`map-action-button history-action${historyOpen ? ' active' : ''}`}
          onClick={() => { setLoadedDrawers((current) => ({ ...current, history: true })); setHistoryOpen(true) }}
          aria-label={t('history.title')}
          variant={historyOpen ? 'light' : 'default'}
          color="blue"
        >
          <IconHistory size={21} stroke={1.8} />
        </MapControlButton>
        </Tooltip>
        <Tooltip label={t('favorites.title')} position="left" openDelay={450}>
        <MapControlButton
          className={`map-action-button favorites-action${favDrawerOpen ? ' active' : ''}`}
          onClick={() => { setLoadedDrawers((current) => ({ ...current, favorites: true })); setFavDrawerOpen(true) }}
          aria-label={t('favorites.title')}
          variant={favDrawerOpen ? 'light' : 'default'}
          color="yellow"
        >
          <IconHeart size={21} stroke={1.8} />
        </MapControlButton>
        </Tooltip>
        <Tooltip label={t('search.title')} position="left" openDelay={450}>
        <MapControlButton
          className={`map-action-button place-search-action${placeSearchOpen ? ' active' : ''}`}
          onClick={() => { setLoadedDrawers((current) => ({ ...current, search: true })); setPlaceSearchOpen(true) }}
          aria-label={t('search.title')}
          variant={placeSearchOpen ? 'light' : 'default'}
          color="blue"
        >
          <IconSearch size={21} stroke={1.8} />
        </MapControlButton>
        </Tooltip>
      </div>

      <Suspense fallback={null}>
        {loadedDrawers.history && <HistoryDrawer isOpen={historyOpen} onClose={() => setHistoryOpen(false)} onFlyTo={onFlyTo} />}
        {loadedDrawers.favorites && <FavoritesDrawer isOpen={favDrawerOpen} onClose={() => setFavDrawerOpen(false)} onSelectFavorite={onSelectFavorite} />}
        {loadedDrawers.search && <PlaceSearchDrawer isOpen={placeSearchOpen} onClose={() => setPlaceSearchOpen(false)} onSelectPlace={onSelectPlace} />}
      </Suspense>
    </>
  )
})
