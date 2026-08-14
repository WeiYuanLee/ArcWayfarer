import { useState } from 'react'
import { ActionIcon, Tooltip } from '@mantine/core'
import { IconHeart, IconHistory } from '@tabler/icons-react'
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
        <Tooltip label={t('history.title')} position="left" openDelay={450}>
        <ActionIcon
          className={`map-action-button history-action${historyOpen ? ' active' : ''}`}
          onClick={() => setHistoryOpen(true)}
          aria-label={t('history.title')}
          variant={historyOpen ? 'light' : 'default'}
          color="blue"
        >
          <IconHistory size={21} stroke={1.8} />
        </ActionIcon>
        </Tooltip>
        <Tooltip label={t('favorites.title')} position="left" openDelay={450}>
        <ActionIcon
          className={`map-action-button favorites-action${favDrawerOpen ? ' active' : ''}`}
          onClick={() => setFavDrawerOpen(true)}
          aria-label={t('favorites.title')}
          variant={favDrawerOpen ? 'light' : 'default'}
          color="yellow"
        >
          <IconHeart size={21} stroke={1.8} />
        </ActionIcon>
        </Tooltip>
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
