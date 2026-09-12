import { useState } from 'react'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ActionIcon, Button, Collapse, Group, Stack, Text, Tooltip } from '@mantine/core'
import { IconChevronRight } from '@tabler/icons-react'
import { useT } from '../../i18n'
import type { Favorite } from '../../services/api'
import { FavoriteItem } from './FavoriteItem'
import type { SortMode } from '../../hooks/useFavorites'

type Props = { groupName: string; items: Favorite[]; sortMode: SortMode; allGroups: string[]; onSelect: (lat: number, lng: number) => void; onUpdate: (id: string, patch: { name?: string; group?: string; notes?: string }) => Promise<Favorite>; onDelete: (favorite: Favorite) => void }

export function FavoriteGroupSection({ groupName, items, sortMode, allGroups, onSelect, onUpdate, onDelete }: Props) {
  const t = useT()
  const [collapsed, setCollapsed] = useState(false)
  const [visibleCount, setVisibleCount] = useState(100)
  const label = groupName || t('favorites.ungrouped')
  const visibleItems = items.slice(0, visibleCount)
  return (
    <Stack gap="xs">
      <Group gap="xs" wrap="nowrap">
        <Tooltip label={label} openDelay={500}>
          <ActionIcon variant="subtle" color="gray" size="sm" aria-label={label} onClick={() => setCollapsed((value) => !value)}>
            <IconChevronRight size={16} style={{ transform: collapsed ? undefined : 'rotate(90deg)', transition: 'transform 150ms ease' }} />
          </ActionIcon>
        </Tooltip>
        <Text size="sm" fw={600} lineClamp={1} style={{ cursor: 'pointer' }} onClick={() => setCollapsed((value) => !value)}>{label}</Text>
        <Text size="xs" c="dimmed">{items.length}</Text>
      </Group>
      <Collapse in={!collapsed}>
        <SortableContext items={visibleItems.map((favorite) => favorite.id)} strategy={verticalListSortingStrategy}>
          <Stack gap="xs">
            {visibleItems.map((favorite) => <FavoriteItem key={favorite.id} favorite={favorite} sortMode={sortMode} groups={allGroups} onSelect={onSelect} onUpdate={onUpdate} onDelete={onDelete} />)}
            {visibleItems.length < items.length && (
              <Button variant="subtle" size="xs" onClick={() => setVisibleCount((count) => count + 100)}>
                顯示更多（尚有 {items.length - visibleItems.length} 筆）
              </Button>
            )}
          </Stack>
        </SortableContext>
      </Collapse>
    </Stack>
  )
}
