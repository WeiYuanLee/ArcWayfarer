import { useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { ActionIcon, Badge, Button, Drawer, Group, SegmentedControl, Stack, Tabs, Text, TextInput, Tooltip } from '@mantine/core'
import { IconDownload, IconFolderPlus, IconHeart, IconMapPin, IconPhoto, IconSearch, IconUpload, IconX } from '@tabler/icons-react'
import { useT } from '../../i18n'
import { useFavorites } from '../../hooks/useFavorites'
import { FavoriteGroupSection } from './FavoriteGroupSection'
import { UndoToast } from '../common/UndoToast'
import type { Favorite } from '../../services/api'
import { FavoriteTransferModal } from './FavoriteTransferModal'
import type { FavoriteTeleportActions } from './FavoriteItem'
import { PikminPostcardsPanel } from './PikminPostcardsPanel'
import { PikminPureSpotsPanel } from './PikminPureSpotsPanel'
import { usePikminMap, type PikminDrawerMode } from '../map/PikminMapContext'

type Props = { isOpen: boolean; onClose: () => void; onSelectFavorite: (lat: number, lng: number) => void }

export function FavoritesDrawer({ isOpen, onClose, onSelectFavorite, ...teleportActions }: Props & FavoriteTeleportActions) {
  const t = useT()
  const pikminMap = usePikminMap()
  const { favorites, savedGroups, displayed, groups, loading, sortMode, setSortMode, search, setSearch, pendingDeletes, requestDelete, undoDelete, handleUpdate, handleCreateGroup, handleReorder, refresh } = useFavorites()
  const searchRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<Exclude<PikminDrawerMode, null>>('favorites')
  const [newGroup, setNewGroup] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [transferMode, setTransferMode] = useState<'export' | 'import' | null>(null)

  useEffect(() => {
    pikminMap.setMode(isOpen ? mode : null)
    if (isOpen) {
      void refresh()
      if (mode === 'favorites') setTimeout(() => searchRef.current?.focus(), 80)
    }
  }, [isOpen, mode, pikminMap.setMode, refresh])

  const regularExportGroups = useMemo(() => Array.from(new Set([
    ...savedGroups,
    ...favorites.filter((favorite) => favorite.source_type === null).map((favorite) => favorite.group).filter(Boolean),
  ])).sort((a, b) => a.localeCompare(b)), [savedGroups, favorites])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = displayed.findIndex((favorite) => favorite.id === active.id)
    const newIndex = displayed.findIndex((favorite) => favorite.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) void handleReorder(arrayMove([...displayed], oldIndex, newIndex))
  }

  async function createGroup() {
    if (!newGroup.trim() || creatingGroup) return
    setCreatingGroup(true)
    try {
      await handleCreateGroup(newGroup.trim())
      setNewGroup('')
    } finally {
      setCreatingGroup(false)
    }
  }

  function close() {
    pikminMap.setMode(null)
    onClose()
  }

  return (
    <Drawer
      opened={isOpen}
      onClose={close}
      position="right"
      size={430}
      withOverlay={false}
      trapFocus={false}
      lockScroll={false}
      closeOnClickOutside={false}
      title={<Group gap="xs"><IconHeart size={18} stroke={1.75} /><Text fw={600}>{t('favorites.title')}</Text>{mode === 'favorites' && <Badge variant="light" size="sm">{displayed.length} {t('favorites.count')}</Badge>}</Group>}
      aria-label={t('favorites.title')}
    >
      <Stack gap="md" h="100%">
        <Text size="xs" c="dimmed">{teleportActions.teleportDeviceName ? `${t('favorites.teleport_device')}：${teleportActions.teleportDeviceName}` : t('panel.hint.select_device')}</Text>
        <Tabs value={mode} onChange={(value) => setMode((value as Exclude<PikminDrawerMode, null>) ?? 'favorites')} keepMounted={false}>
          <Tabs.List grow>
            <Tabs.Tab value="favorites" leftSection={<IconHeart size={14} />}>我的最愛</Tabs.Tab>
            <Tabs.Tab value="postcards" leftSection={<IconPhoto size={14} />}>明信片</Tabs.Tab>
            <Tabs.Tab value="purespots" leftSection={<IconMapPin size={14} />}>純點</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="favorites" pt="md">
            <Stack gap="md">
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
              <Group gap="xs" align="stretch" wrap="nowrap">
                <SegmentedControl
                  size="xs"
                  value={sortMode}
                  onChange={(value) => setSortMode(value as typeof sortMode)}
                  data={(['manual', 'name', 'date'] as const).map((value) => ({ value, label: t(`favorites.sort.${value}` as Parameters<typeof t>[0]) }))}
                  style={{ flex: '1 1 auto', minWidth: 0 }}
                />
                <TextInput
                  size="xs"
                  value={newGroup}
                  maxLength={40}
                  placeholder={t('favorites.new_group_placeholder')}
                  onChange={(event) => setNewGroup(event.currentTarget.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') void createGroup() }}
                  rightSection={<Tooltip label={t('favorites.create_group')}><ActionIcon variant="subtle" color="blue" size="sm" aria-label={t('favorites.create_group')} onClick={() => void createGroup()} loading={creatingGroup} disabled={!newGroup.trim()}><IconFolderPlus size={16} /></ActionIcon></Tooltip>}
                  rightSectionPointerEvents="all"
                  style={{ flex: '0 1 148px', minWidth: 120 }}
                />
              </Group>
              <Group grow>
                <ActionIcon variant="default" size="lg" aria-label={t('favorites.export')} onClick={() => setTransferMode('export')}><Tooltip label={t('favorites.export')}><IconDownload size={17} /></Tooltip></ActionIcon>
                <ActionIcon variant="default" size="lg" aria-label={t('favorites.import')} onClick={() => setTransferMode('import')}><Tooltip label={t('favorites.import')}><IconUpload size={17} /></Tooltip></ActionIcon>
              </Group>
              {loading && <Text c="dimmed" size="sm">{t('generic.working')}</Text>}
              {!loading && groups.length === 0 && <Text c="dimmed" size="sm">{search ? t('favorites.empty_search') : t('favorites.empty')}</Text>}
              {!loading && groups.length > 0 && (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <Stack gap="md">
                    {groups.map((groupName) => {
                      const items = displayed.filter((favorite) => (favorite.group || '') === groupName)
                      return <FavoriteGroupSection key={groupName} groupName={groupName} items={items} sortMode={sortMode} allGroups={groups} onSelect={(lat, lng) => { onSelectFavorite(lat, lng); close() }} onUpdate={handleUpdate} onDelete={requestDelete} {...teleportActions} />
                    })}
                  </Stack>
                </DndContext>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="postcards" pt="md">
            <PikminPostcardsPanel favorites={favorites} onFavoritesChanged={refresh} onSelectPoint={onSelectFavorite} {...teleportActions} />
          </Tabs.Panel>

          <Tabs.Panel value="purespots" pt="md">
            <PikminPureSpotsPanel favorites={favorites} onFavoritesChanged={refresh} onSelectPoint={onSelectFavorite} {...teleportActions} />
          </Tabs.Panel>
        </Tabs>
      </Stack>
      <FavoriteTransferModal mode={transferMode} groups={regularExportGroups} onClose={() => setTransferMode(null)} onImported={refresh} />
      <UndoToast pendingDeletes={pendingDeletes} onUndo={undoDelete} />
    </Drawer>
  )
}
