import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, Group, Loader, Paper, Select, Stack, Text } from '@mantine/core'
import { IconHeart, IconLocation } from '@tabler/icons-react'
import { addPikminFavorite, getPikminSyncStatus, getRandomPikminPureSpot, listPikminPureSpots, listPikminPureSpotTypes, type Favorite, type PikminPureSpot, type PikminPureSpotType } from '../../services/api'
import { usePikminMap } from '../map/PikminMapContext'
import { showToast } from '../common/Toast'
import type { FavoriteTeleportActions } from './FavoriteItem'
import { PikminSourceAttribution } from './PikminSourceAttribution'

type Props = FavoriteTeleportActions & {
  favorites: Favorite[]
  onFavoritesChanged: () => Promise<void>
  onSelectPoint: (lat: number, lng: number) => void
}

function asFavorite(spot: PikminPureSpot): Favorite {
  return {
    id: `purespot-${spot.id}`,
    name: spot.name,
    lat: spot.lat,
    lng: spot.lng,
    created_at: 0,
    group: '純點收藏',
    notes: spot.ext ?? '',
    order: 0,
    source_type: 'purespot',
    source_id: spot.id,
    source_image_url: null,
    postcard_type: null,
    decor_type: spot.type,
  }
}

export function PikminPureSpotsPanel({ favorites, onFavoritesChanged, onSelectPoint, ...teleportActions }: Props) {
  const { bounds, spots, setSpots, selectedSpot, setSelectedSpot } = usePikminMap()
  const [types, setTypes] = useState<PikminPureSpotType[]>([])
  const [type, setType] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [addingId, setAddingId] = useState<number | null>(null)
  const typeSelectionRequestRef = useRef(0)
  const favoriteItems = Array.isArray(favorites) ? favorites : []
  const saved = useMemo(() => new Set(
    favoriteItems.filter((item) => item.source_type === 'purespot').map((item) => item.source_id),
  ), [favoriteItems])

  useEffect(() => {
    const controller = new AbortController()
    void listPikminPureSpotTypes(controller.signal).then(setTypes).catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!bounds || bounds.zoom < 13) {
      setSpots([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const items = await listPikminPureSpots(bounds, type ? [type] : [], controller.signal)
        setSpots(items)
        if (items.length === 0) {
          const sync = await getPikminSyncStatus()
          if (sync.status === 'running') setError('首次資料同步中，完成後移動一下地圖即可載入。')
        }
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '讀取純點失敗')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 220)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [bounds, type, setSpots])

  async function add(spot: PikminPureSpot) {
    if (addingId !== null || saved.has(spot.id)) return
    setAddingId(spot.id)
    try {
      await addPikminFavorite('purespot', spot.id)
      await onFavoritesChanged()
      showToast(`已收藏「${spot.name}」`)
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : '收藏失敗')
    } finally {
      setAddingId(null)
    }
  }

  function focusSpot(spot: PikminPureSpot) {
    setSelectedSpot(spot)
    onSelectPoint(spot.lat, spot.lng)
  }

  async function selectType(nextType: string) {
    setType(nextType)
    setSelectedSpot(null)
    setError('')
    const requestId = ++typeSelectionRequestRef.current
    if (!nextType) return
    setLoading(true)
    try {
      const spot = await getRandomPikminPureSpot(nextType)
      if (typeSelectionRequestRef.current !== requestId) return
      focusSpot(spot)
    } catch (reason) {
      if (typeSelectionRequestRef.current === requestId) {
        setError(reason instanceof Error ? reason.message : '找不到這個種類的純點')
      }
    } finally {
      if (typeSelectionRequestRef.current === requestId) setLoading(false)
    }
  }

  const visibleItems = selectedSpot
    ? [selectedSpot, ...spots.filter((spot) => spot.id !== selectedSpot.id)].slice(0, 100)
    : spots.slice(0, 100)

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="baseline" gap="xs">
        <Text size="sm" fw={500}>飾品種類</Text>
        <PikminSourceAttribution />
      </Group>
      <Select
        aria-label="飾品種類"
        value={type}
        onChange={(value) => { void selectType(value ?? '') }}
        data={[
          { value: '', label: '全部種類' },
          ...types.map((item) => ({ value: item.type, label: `${item.icon} ${item.type}（${item.count}）` })),
        ]}
        allowDeselect={false}
        maxDropdownHeight={300}
        comboboxProps={{ withinPortal: false }}
      />
      {!bounds && <Text size="sm" c="dimmed">等待地圖範圍…</Text>}
      {bounds && bounds.zoom < 13 && <Text size="sm" c="dimmed">請放大地圖方能看到純點座標。</Text>}
      {bounds && bounds.zoom >= 13 && (
        <Group justify="space-between">
          <Text size="xs" c="dimmed">目前畫面 {spots.length} 個純點</Text>
          {loading && <Loader size="xs" />}
        </Group>
      )}
      {error && <Text size="xs" c={error.includes('同步中') ? 'dimmed' : 'red'}>{error}</Text>}
      {visibleItems.map((spot) => (
        <Paper
          key={spot.id}
          withBorder
          p="sm"
          radius="md"
          role="button"
          tabIndex={0}
          aria-label={`在地圖預覽 ${spot.name}`}
          aria-pressed={selectedSpot?.id === spot.id}
          onClick={() => focusSpot(spot)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              focusSpot(spot)
            }
          }}
          style={{ cursor: 'pointer', ...(selectedSpot?.id === spot.id ? { borderColor: 'var(--mantine-color-pink-5)' } : {}) }}
        >
          <Stack gap={5}>
            <Group gap="xs" wrap="nowrap">
              <Text fz={22}>{spot.icon}</Text>
              <Text size="sm" fw={600} lineClamp={2} style={{ flex: 1 }}>{spot.name}</Text>
              <Badge size="xs" variant="light">{spot.type}</Badge>
            </Group>
            <Text size="xs" c="dimmed">{[spot.city, spot.district].filter(Boolean).join(' ') || '未標示區域'}</Text>
            <Text size="xs" ff="monospace">{spot.lat.toFixed(6)}, {spot.lng.toFixed(6)}</Text>
            <Group gap={4}>
              <Button
                size="compact-xs"
                variant="light"
                leftSection={<IconLocation size={13} />}
                disabled={Boolean(teleportActions.teleportDisabledReason) || teleportActions.teleportingFavoriteId !== null}
                loading={teleportActions.teleportingFavoriteId === `purespot-${spot.id}`}
                onClick={(event) => { event.stopPropagation(); void teleportActions.onTeleportFavorite(asFavorite(spot)) }}
              >定位</Button>
              <Button
                size="compact-xs"
                variant={saved.has(spot.id) ? 'default' : 'filled'}
                leftSection={<IconHeart size={13} />}
                disabled={saved.has(spot.id)}
                loading={addingId === spot.id}
                onClick={(event) => { event.stopPropagation(); void add(spot) }}
              >{saved.has(spot.id) ? '已收藏' : '收藏'}</Button>
            </Group>
          </Stack>
        </Paper>
      ))}
      {spots.length > 100 && <Text size="xs" c="dimmed">清單先顯示 100 筆；所有目前範圍內的點仍會顯示在地圖上。</Text>}
    </Stack>
  )
}
