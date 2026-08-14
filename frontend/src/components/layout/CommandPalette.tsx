import { useEffect, useMemo, useState } from 'react'
import { Spotlight, type SpotlightActionData } from '@mantine/spotlight'
import { IconDeviceMobile, IconHistory, IconMapPin, IconRefresh, IconRoute, IconStar, IconTerminal2 } from '@tabler/icons-react'
import { listFavorites, listHistory, type Favorite, type HistoryEntry } from '../../services/api'
import { useT } from '../../i18n'
import type { Mode } from '../ModeSelector'
import { usePlaceSearch } from '../../hooks/usePlaceSearch'

type Props = {
  isOpen: boolean
  onClose: () => void
  onSelectMode: (mode: Mode) => void
  onFlyTo: (lat: number, lng: number) => void
  onSelectPlace?: (lat: number, lng: number, placeName?: string) => void
  onRefreshDevices: () => void
  onOpenUpdateModal?: () => void
}

export function CommandPalette({ isOpen, onClose, onSelectMode, onFlyTo, onSelectPlace, onRefreshDevices, onOpenUpdateModal }: Props) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const { results: placeResults, loading: placeLoading } = usePlaceSearch(query.startsWith('@') ? '' : query)
  const handlePlaceSelect = onSelectPlace || onFlyTo

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    listFavorites().then(setFavorites).catch(() => {})
    listHistory().then((items: HistoryEntry[]) => setHistory(items.slice(0, 10))).catch(() => {})
  }, [isOpen])

  const actions = useMemo<SpotlightActionData[]>(() => {
    const trigger = (action: () => void) => () => { action(); onClose() }
    const modes: { id: Mode; label: string }[] = [
      { id: 'teleport', label: t('mode.teleport') }, { id: 'navigate', label: t('mode.navigate') },
      { id: 'route-loop', label: t('mode.route_loop') }, { id: 'multi-stop', label: t('mode.multi_stop') },
      { id: 'random-walk', label: t('mode.random_walk') }, { id: 'joystick', label: t('mode.joystick') },
    ]
    const base: SpotlightActionData[] = modes.map((mode) => ({
      id: `mode-${mode.id}`, group: 'Modes', label: mode.label, description: 'Mode', leftSection: <IconRoute size={17} />, onClick: trigger(() => onSelectMode(mode.id)),
    }))
    base.push({ id: 'refresh-devices', group: 'Actions', label: t('device.rescan'), description: 'Action', leftSection: <IconRefresh size={17} />, onClick: trigger(onRefreshDevices) })
    if (onOpenUpdateModal) base.push({ id: 'check-update', group: 'Actions', label: t('version.check_btn'), description: 'Action', leftSection: <IconDeviceMobile size={17} />, onClick: trigger(onOpenUpdateModal) })
    base.push(...favorites.map((favorite) => ({
      id: `favorite-${favorite.id}`, group: 'Favorites', label: favorite.name, description: `${favorite.lat.toFixed(4)}, ${favorite.lng.toFixed(4)}`,
      leftSection: <IconStar size={17} />, onClick: trigger(() => handlePlaceSelect(favorite.lat, favorite.lng, favorite.name)),
    })))
    base.push(...history.map((item, index) => ({
      id: `history-${index}-${item.ts}`, group: 'History', label: item.name || `${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}`, description: item.kind,
      leftSection: <IconHistory size={17} />, onClick: trigger(() => handlePlaceSelect(item.lat, item.lng, item.name || undefined)),
    })))
    if (!query.startsWith('@')) base.push(...placeResults.map((place) => ({
      id: `place-${place.id}`, group: 'Places', label: place.name, description: place.address,
      leftSection: <IconMapPin size={17} />, onClick: trigger(() => handlePlaceSelect(place.lat, place.lng, place.name)),
    })))
    return query.startsWith('@') ? base.filter((item) => item.group === 'Favorites') : base
  }, [favorites, handlePlaceSelect, history, onClose, onOpenUpdateModal, onRefreshDevices, onSelectMode, placeResults, query, t])

  return (
    <Spotlight
      actions={actions}
      forceOpened={isOpen}
      onSpotlightClose={onClose}
      onQueryChange={setQuery}
      query={query}
      shortcut={null}
      searchProps={{ placeholder: t('cmdpalette.placeholder') }}
      nothingFound={placeLoading ? t('cmdpalette.searching') : t('cmdpalette.no_results')}
      scrollable
      maxHeight={420}
      centered
      zIndex={2200}
      leftSection={<IconTerminal2 size={18} />}
    />
  )
}
