import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Group, Loader, Modal, Paper, SegmentedControl, Select, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { IconHeart, IconLocation, IconPhotoOff, IconSearch, IconZoomIn } from '@tabler/icons-react'
import { addPikminFavorite, getPikminSyncStatus, listPikminPostcards, pikminPostcardImageUrl, startPikminSync, type Favorite, type PikminPostcard, type PikminPostcardPage } from '../../services/api'
import { showToast } from '../common/Toast'
import type { FavoriteTeleportActions } from './FavoriteItem'
import { PikminSourceAttribution } from './PikminSourceAttribution'

type Props = FavoriteTeleportActions & {
  favorites: Favorite[]
  onFavoritesChanged: () => Promise<void>
  onSelectPoint: (lat: number, lng: number) => void
}

const POSTCARD_TYPES = {
  mushroom: { icon: '🍄', label: '菇明信片', tagLabel: '菇', color: 'green' },
  flower: { icon: '🌸', label: '花明信片', tagLabel: '花', color: 'pink' },
  hidden: { icon: '🙈', label: '隱藏明信片', tagLabel: '隱藏', color: 'gray' },
} as const

function asFavorite(postcard: PikminPostcard): Favorite {
  return {
    id: `postcard-${postcard.id}`,
    name: postcard.name,
    lat: postcard.lat,
    lng: postcard.lng,
    created_at: 0,
    group: '明信片收藏',
    notes: postcard.description,
    order: 0,
    source_type: 'postcard',
    source_id: postcard.id,
    source_image_url: postcard.image_url,
    postcard_type: postcard.type,
    decor_type: null,
  }
}

export function PikminPostcardsPanel({ favorites, onFavoritesChanged, onSelectPoint, ...teleportActions }: Props) {
  const [query, setQuery] = useState('')
  const [country, setCountry] = useState('')
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<PikminPostcardPage>({ items: [], total: 0, page: 1, page_size: 12, countries: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<PikminPostcard | null>(null)
  const [failedImages, setFailedImages] = useState<Set<number>>(() => new Set())
  const [reloadToken, setReloadToken] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [addingId, setAddingId] = useState<number | null>(null)
  const favoriteItems = Array.isArray(favorites) ? favorites : []
  const saved = useMemo(() => new Set(
    favoriteItems.filter((item) => item.source_type === 'postcard').map((item) => item.source_id),
  ), [favoriteItems])

  useEffect(() => {
    setPage(1)
  }, [query, country, type])

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const next = await listPikminPostcards({ query, country, type, page, pageSize: 12 }, controller.signal)
        setResult(next)
        if (next.total === 0) {
          const sync = await getPikminSyncStatus()
          if (sync.status === 'running' && !controller.signal.aborted) {
            setTimeout(() => setReloadToken((value) => value + 1), 1500)
          }
        }
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '讀取明信片失敗')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, country, type, page, reloadToken])

  async function add(postcard: PikminPostcard) {
    if (addingId !== null || saved.has(postcard.id)) return
    setAddingId(postcard.id)
    try {
      await addPikminFavorite('postcard', postcard.id)
      await onFavoritesChanged()
      showToast(`已收藏「${postcard.name}」`)
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : '收藏失敗')
    } finally {
      setAddingId(null)
    }
  }

  async function refreshFromSource() {
    if (syncing) return
    setSyncing(true)
    try {
      let status = await startPikminSync()
      while (status.status === 'running') {
        await new Promise((resolve) => setTimeout(resolve, 1200))
        status = await getPikminSyncStatus()
      }
      if (status.status !== 'success') throw new Error(status.error || '資料更新失敗')
      setFailedImages(new Set())
      setReloadToken((value) => value + 1)
      showToast(`已更新來源資料，共 ${status.counts.postcards} 張明信片。`)
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : '資料更新失敗')
    } finally {
      setSyncing(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.page_size))

  return (
    <>
      <Stack gap="sm">
        <TextInput
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          leftSection={<IconSearch size={16} />}
          placeholder="搜尋名稱或描述"
        />
        <Group justify="space-between" align="baseline" gap="xs">
          <Text size="sm" fw={500}>國家</Text>
          <PikminSourceAttribution />
        </Group>
        <Group grow align="center">
          <Select
            aria-label="國家"
            value={country}
            onChange={(value) => setCountry(value ?? '')}
            data={[{ value: '', label: '全部國家' }, ...result.countries.map((value) => ({ value, label: value }))]}
            allowDeselect={false}
            maxDropdownHeight={280}
            comboboxProps={{ withinPortal: false }}
          />
          <SegmentedControl
            value={type}
            onChange={setType}
            data={[
              { value: '', label: '全部' },
              ...Object.entries(POSTCARD_TYPES).map(([value, item]) => ({
                value,
                label: <Tooltip key={value} label={item.label} withArrow openDelay={250}><span aria-label={item.label}>{item.icon}</span></Tooltip>,
              })),
            ]}
          />
        </Group>
        <Group justify="space-between">
          <Text size="xs" c="dimmed">共 {result.total} 張</Text>
          <Button variant="subtle" size="compact-xs" loading={syncing} onClick={() => void refreshFromSource()}>{syncing ? '更新中' : '重新整理'}</Button>
        </Group>
        {loading && <Group justify="center" py="lg"><Loader size="sm" /></Group>}
        {error && <Text c="red" size="sm">{error}</Text>}
        {!loading && !error && result.items.length === 0 && <Text c="dimmed" size="sm">目前沒有資料；首次同步可能仍在背景進行。</Text>}
        {result.items.map((postcard) => (
          <Paper
            key={postcard.id}
            withBorder
            p="sm"
            radius="md"
            h={154}
            role="button"
            tabIndex={0}
            aria-label={`在地圖預覽 ${postcard.name}`}
            onClick={() => onSelectPoint(postcard.lat, postcard.lng)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelectPoint(postcard.lat, postcard.lng)
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            <Group align="flex-start" wrap="nowrap" h="100%">
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); setPreview(postcard) }}
                aria-label={`預覽 ${postcard.name}`}
                style={{ position: 'relative', border: 0, padding: 0, borderRadius: 10, background: 'transparent', cursor: 'zoom-in', flex: '0 0 auto' }}
              >
                {failedImages.has(postcard.id) ? (
                  <span style={{ width: 128, height: 128, display: 'grid', placeItems: 'center', borderRadius: 10, background: 'var(--mantine-color-gray-1)', color: 'var(--mantine-color-gray-6)' }}>
                    <IconPhotoOff size={26} />
                  </span>
                ) : (
                  <img
                    src={pikminPostcardImageUrl(postcard.id)}
                    alt={postcard.name}
                    loading="lazy"
                    style={{ width: 128, height: 128, objectFit: 'cover', borderRadius: 10, background: 'var(--mantine-color-gray-1)', display: 'block' }}
                    onError={() => {
                      setFailedImages((current) => new Set(current).add(postcard.id))
                      setReloadToken((value) => value + 1)
                    }}
                  />
                )}
                {!failedImages.has(postcard.id) && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      right: 6,
                      bottom: 6,
                      width: 27,
                      height: 27,
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: '50%',
                      color: '#fff',
                      background: 'rgba(20, 25, 32, 0.72)',
                      border: '1px solid rgba(255, 255, 255, 0.75)',
                      boxShadow: '0 1px 4px rgba(0, 0, 0, 0.35)',
                      pointerEvents: 'none',
                    }}
                  >
                    <IconZoomIn size={16} stroke={2} />
                  </span>
                )}
              </button>
              <Stack gap={3} h="100%" style={{ minWidth: 0, flex: 1 }}>
                <Group gap={6} wrap="nowrap">
                  <Text size="sm" fw={600} lineClamp={2} style={{ flex: 1 }}>{postcard.name}</Text>
                  <Tooltip label={POSTCARD_TYPES[postcard.type].label} withArrow>
                    <Badge
                      size="xs"
                      variant="light"
                      color={POSTCARD_TYPES[postcard.type].color}
                      radius="xl"
                      aria-label={POSTCARD_TYPES[postcard.type].label}
                      leftSection={<span aria-hidden="true">{POSTCARD_TYPES[postcard.type].icon}</span>}
                    >
                      {POSTCARD_TYPES[postcard.type].tagLabel}
                    </Badge>
                  </Tooltip>
                </Group>
                <Text size="xs" c="dimmed">{postcard.country || '未標示國家'} · 👍 {postcard.likes}</Text>
                <Text size="xs" lineClamp={2} style={{ minHeight: 30 }}>{postcard.description || '\u00a0'}</Text>
                <Group gap={4} mt="auto">
                  <Button
                    size="compact-xs"
                    variant="light"
                    leftSection={<IconLocation size={13} />}
                    disabled={Boolean(teleportActions.teleportDisabledReason) || teleportActions.teleportingFavoriteId !== null}
                    loading={teleportActions.teleportingFavoriteId === `postcard-${postcard.id}`}
                    onClick={(event) => { event.stopPropagation(); void teleportActions.onTeleportFavorite(asFavorite(postcard)) }}
                  >定位</Button>
                  <Button
                    size="compact-xs"
                    variant={saved.has(postcard.id) ? 'default' : 'filled'}
                    leftSection={<IconHeart size={13} />}
                    disabled={saved.has(postcard.id)}
                    loading={addingId === postcard.id}
                    onClick={(event) => { event.stopPropagation(); void add(postcard) }}
                  >{saved.has(postcard.id) ? '已收藏' : '收藏'}</Button>
                </Group>
              </Stack>
            </Group>
          </Paper>
        ))}
        {totalPages > 1 && (
          <Group justify="center">
            <Button variant="default" size="xs" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一頁</Button>
            <Text size="xs">{page} / {totalPages}</Text>
            <Button variant="default" size="xs" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>下一頁</Button>
          </Group>
        )}
      </Stack>
      <Modal opened={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.name} centered size="lg">
        {preview && (
          <Stack gap="sm">
            <img src={pikminPostcardImageUrl(preview.id)} alt={preview.name} style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: 12 }} />
            <Text size="sm">{preview.description}</Text>
            <Text size="xs" c="dimmed">{preview.country} · {preview.date} · {preview.submitter}</Text>
          </Stack>
        )}
      </Modal>
    </>
  )
}
