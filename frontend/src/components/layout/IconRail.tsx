import { useRef, useState } from 'react'
import { FloatingCard } from './FloatingCard'
import { HistoryPanel } from './HistoryPanel'
import { FavoritesDrawer } from './FavoritesDrawer'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useT } from '../../i18n'

type FlyoutKind = 'history'

type Props = {
  onFlyTo: (lat: number, lng: number) => void
  onSelectFavorite: (lat: number, lng: number) => void
}

export function IconRail({ onFlyTo, onSelectFavorite }: Props) {
  const t = useT()
  const [open, setOpen] = useState<FlyoutKind | null>(null)
  const [favDrawerOpen, setFavDrawerOpen] = useState(false)
  const railRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useClickOutside([railRef, panelRef], () => setOpen(null), open !== null)

  function toggle(kind: FlyoutKind) {
    setOpen((current) => (current === kind ? null : kind))
  }

  function handleFlyTo(lat: number, lng: number) {
    onFlyTo(lat, lng)
    setOpen(null)
  }

  return (
    <>
      <div className="icon-rail" ref={railRef}>
        <button
          className={open === 'history' ? 'active' : ''}
          onClick={() => toggle('history')}
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

      {open === 'history' && (
        <div className="flyout-panel" ref={panelRef}>
          <FloatingCard>
            <HistoryPanel onFlyTo={handleFlyTo} />
          </FloatingCard>
        </div>
      )}

      <FavoritesDrawer
        isOpen={favDrawerOpen}
        onClose={() => setFavDrawerOpen(false)}
        onSelectFavorite={onSelectFavorite}
      />
    </>
  )
}
