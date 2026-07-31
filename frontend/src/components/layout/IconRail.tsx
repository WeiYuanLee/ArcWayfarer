import { useRef, useState } from 'react'
import { FloatingCard } from './FloatingCard'
import { HistoryPanel } from './HistoryPanel'
import { FavoritesPanel } from './FavoritesPanel'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useT } from '../../i18n'

type FlyoutKind = 'history' | 'favorites'

type Props = {
  onFlyTo: (lat: number, lng: number) => void
}

export function IconRail({ onFlyTo }: Props) {
  const t = useT()
  const [open, setOpen] = useState<FlyoutKind | null>(null)
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
          className={open === 'favorites' ? 'active' : ''}
          onClick={() => toggle('favorites')}
          title={t('favorites.title')}
        >
          ⭐
        </button>
      </div>

      {open && (
        <div className="flyout-panel" ref={panelRef}>
          <FloatingCard>
            {open === 'history' ? <HistoryPanel onFlyTo={handleFlyTo} /> : <FavoritesPanel onFlyTo={handleFlyTo} />}
          </FloatingCard>
        </div>
      )}
    </>
  )
}
