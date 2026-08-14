import { useEffect, useRef } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { ActionIcon, Badge, Drawer, Group, SegmentedControl, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { IconHeart, IconSearch, IconX } from '@tabler/icons-react'
import { useT } from '../../i18n'
import { useFavorites } from '../../hooks/useFavorites'
import { FavoriteGroupSection } from './FavoriteGroupSection'
import { UndoToast } from '../common/UndoToast'
import type { Favorite } from '../../services/api'

type Props = { isOpen: boolean; onClose: () => void; onSelectFavorite: (lat: number, lng: number) => void }

export function FavoritesDrawer({ isOpen, onClose, onSelectFavorite }: Props) {
  const t = useT()
  const { displayed, groups, loading, sortMode, setSortMode, search, setSearch, pendingDeletes, requestDelete, undoDelete, handleUpdate, handleReorder, refresh } = useFavorites()
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      refresh()
      setTimeout(() => searchRef.current?.focus(), 80)
    }
  }, [isOpen, refresh])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = displayed.findIndex((f) => f.id === active.id)
    const newIndex = displayed.findIndex((f) => f.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) void handleReorder(arrayMove([...displayed], oldIndex, newIndex))
  }

  return (
    <Drawer
      opened={isOpen}
      onClose={onClose}
      position="right"
      size={400}
      title={<Group gap="xs"><IconHeart size={18} stroke={1.75} /><Text fw={600}>{t('favorites.title')}</Text><Badge variant="light" size="sm">{displayed.length} {t('favorites.count')}</Badge></Group>}
      aria-label={t('favorites.title')}
    >
      <Stack gap="md" h="100%">
        <TextInput
          ref={searchRef}
          value={search}
          placeholder={t('favorites.search_placeholder')}
          onChange={(event) => setSearch(event.currentTarget.value)}
          leftSection={<IconSearch size={16} />}
          rightSection={search ? <Tooltip label="Clear"><ActionIcon variant="subtle" color="gray" size="sm" aria-label="Clear" onClick={() => setSearch('')}><IconX size={15} /></ActionIcon></Tooltip> : undefined}
          rightSectionPointerEvents={search ? 'all' : 'none'}
          aria-label={t('favorites.search_placeholder')}
        />
        <SegmentedControl
          fullWidth
          size="xs"
          value={sortMode}
          onChange={(value) => setSortMode(value as typeof sortMode)}
          data={(['manual', 'name', 'date'] as const).map((value) => ({ value, label: t(`favorites.sort.${value}` as Parameters<typeof t>[0]) }))}
        />
        {loading && <Text c="dimmed" size="sm">{t('generic.working')}</Text>}
        {!loading && displayed.length === 0 && <Text c="dimmed" size="sm">{search ? t('favorites.empty_search') : t('favorites.empty')}</Text>}
        {!loading && displayed.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <Stack gap="md">
              {groups.map((groupName) => {
                const items = displayed.filter((favorite) => (favorite.group || '') === groupName)
                return items.length ? <FavoriteGroupSection key={groupName} groupName={groupName} items={items} sortMode={sortMode} allGroups={groups} onSelect={(lat, lng) => { onSelectFavorite(lat, lng); onClose() }} onUpdate={handleUpdate} onDelete={requestDelete} /> : null
              })}
            </Stack>
          </DndContext>
        )}
      </Stack>
      <UndoToast pendingDeletes={pendingDeletes} onUndo={undoDelete} />
    </Drawer>
  )
}
