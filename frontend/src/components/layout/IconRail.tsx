import { lazy, memo, Suspense, useState } from 'react'
import { Tooltip } from '@mantine/core'
import { IconHeart, IconHistory, IconSearch } from '@tabler/icons-react'
import { useT } from '../../i18n'
import { MapControlButton } from '../map/MapControlButton'

let favoritesDrawerPromise: Promise<typeof import('./FavoritesDrawer')> | null = null
let historyDrawerPromise: Promise<typeof import('./HistoryDrawer')> | null = null
let placeSearchDrawerPromise: Promise<typeof import('../map/PlaceSearchDrawer')> | null = null

function preloadFavoritesDrawer() {
  favoritesDrawerPromise ??= import('./FavoritesDrawer').catch((error) => {
    favoritesDrawerPromise = null
    throw error
  })
  return favoritesDrawerPromise
}

function preloadHistoryDrawer() {
  historyDrawerPromise ??= import('./HistoryDrawer').catch((error) => {
    historyDrawerPromise = null
    throw error
  })
  return historyDrawerPromise
}

function preloadPlaceSearchDrawer() {
  placeSearchDrawerPromise ??= import('../map/PlaceSearchDrawer').catch((error) => {
    placeSearchDrawerPromise = null
    throw error
  })
  return placeSearchDrawerPromise
}

const FavoritesDrawer = lazy(() => preloadFavoritesDrawer().then((module) => ({ default: module.FavoritesDrawer })))
const HistoryDrawer = lazy(() => preloadHistoryDrawer().then((module) => ({ default: module.HistoryDrawer })))
const PlaceSearchDrawer = lazy(() => preloadPlaceSearchDrawer().then((module) => ({ default: module.PlaceSearchDrawer })))

type Props = {
  onFlyTo: (lat: number, lng: number) => void
  onSelectFavorite: (lat: number, lng: number) => void
  onSelectPlace: (lat: number, lng: number, placeName: string) => void
}

type ActiveDrawer = 'history' | 'favorites' | 'search' | null

export const IconRail = memo(function IconRail({ onFlyTo, onSelectFavorite, onSelectPlace }: Props) {
  const t = useT()
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawer>(null)
  const [loadedDrawers, setLoadedDrawers] = useState({ history: false, favorites: false, search: false })

  function openDrawer(drawer: Exclude<ActiveDrawer, null>) {
    setLoadedDrawers((current) => ({ ...current, [drawer]: true }))
    setActiveDrawer(drawer)
  }

  function closeDrawer(drawer: Exclude<ActiveDrawer, null>) {
    setActiveDrawer((current) => current === drawer ? null : current)
  }

  return (
    <>
      <div className="icon-rail">
        <Tooltip label={t('history.title')} position="left" openDelay={450}>
          <MapControlButton
            className={`map-action-button history-action${activeDrawer === 'history' ? ' active' : ''}`}
            onPointerEnter={() => { void preloadHistoryDrawer().catch(() => {}) }}
            onFocus={() => { void preloadHistoryDrawer().catch(() => {}) }}
            onClick={() => openDrawer('history')}
            aria-label={t('history.title')}
            aria-expanded={activeDrawer === 'history'}
            variant={activeDrawer === 'history' ? 'light' : 'default'}
            color="blue"
          >
            <IconHistory size={21} stroke={1.8} />
          </MapControlButton>
        </Tooltip>
        <Tooltip label={t('favorites.title')} position="left" openDelay={450}>
          <MapControlButton
            className={`map-action-button favorites-action${activeDrawer === 'favorites' ? ' active' : ''}`}
            onPointerEnter={() => { void preloadFavoritesDrawer().catch(() => {}) }}
            onFocus={() => { void preloadFavoritesDrawer().catch(() => {}) }}
            onClick={() => openDrawer('favorites')}
            aria-label={t('favorites.title')}
            aria-expanded={activeDrawer === 'favorites'}
            variant={activeDrawer === 'favorites' ? 'light' : 'default'}
            color="yellow"
          >
            <IconHeart size={21} stroke={1.8} />
          </MapControlButton>
        </Tooltip>
        <Tooltip label={t('search.title')} position="left" openDelay={450}>
          <MapControlButton
            className={`map-action-button place-search-action${activeDrawer === 'search' ? ' active' : ''}`}
            onPointerEnter={() => { void preloadPlaceSearchDrawer().catch(() => {}) }}
            onFocus={() => { void preloadPlaceSearchDrawer().catch(() => {}) }}
            onClick={() => openDrawer('search')}
            aria-label={t('search.title')}
            aria-expanded={activeDrawer === 'search'}
            variant={activeDrawer === 'search' ? 'light' : 'default'}
            color="blue"
          >
            <IconSearch size={21} stroke={1.8} />
          </MapControlButton>
        </Tooltip>
      </div>

      <Suspense fallback={null}>
        {loadedDrawers.history && <HistoryDrawer isOpen={activeDrawer === 'history'} onClose={() => closeDrawer('history')} onFlyTo={onFlyTo} />}
      </Suspense>
      <Suspense fallback={null}>
        {loadedDrawers.favorites && <FavoritesDrawer isOpen={activeDrawer === 'favorites'} onClose={() => closeDrawer('favorites')} onSelectFavorite={onSelectFavorite} />}
      </Suspense>
      <Suspense fallback={null}>
        {loadedDrawers.search && <PlaceSearchDrawer isOpen={activeDrawer === 'search'} onClose={() => closeDrawer('search')} onSelectPlace={onSelectPlace} />}
      </Suspense>
    </>
  )
})
