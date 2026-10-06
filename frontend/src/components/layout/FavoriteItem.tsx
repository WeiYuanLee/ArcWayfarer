import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ActionIcon, Button, Group, Paper, Select, Stack, Text, TextInput, Textarea, Tooltip, UnstyledButton } from '@mantine/core'
import { IconDeviceFloppy, IconGripVertical, IconLocation, IconPencil, IconTrash, IconX } from '@tabler/icons-react'
import { useT } from '../../i18n'
import { pikminPostcardImageUrl, type Favorite } from '../../services/api'

type Props = { favorite: Favorite; sortMode: 'manual' | 'name' | 'date'; groups: string[]; onSelect: (lat: number, lng: number) => void; onUpdate: (id: string, patch: { name?: string; group?: string; notes?: string }) => Promise<Favorite>; onDelete: (favorite: Favorite) => void }

export type FavoriteTeleportActions = {
  onTeleportFavorite: (favorite: Favorite) => Promise<void>
  teleportDisabledReason: string | null
  teleportingFavoriteId: string | null
  teleportDeviceName: string | null
}

export function FavoriteItem({ favorite, sortMode, groups, onSelect, onUpdate, onDelete, onTeleportFavorite, teleportDisabledReason, teleportingFavoriteId, teleportDeviceName }: Props & FavoriteTeleportActions) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(favorite.name)
  const [group, setGroup] = useState(favorite.group)
  const [notes, setNotes] = useState(favorite.notes)
  const [saving, setSaving] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: favorite.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    contentVisibility: 'auto' as const,
    containIntrinsicSize: '72px',
  }
  const resetAndEdit = () => { setName(favorite.name); setGroup(favorite.group); setNotes(favorite.notes); setEditing(true) }
  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try { await onUpdate(favorite.id, { name: name.trim(), group: group.trim(), notes: notes.trim() }); setEditing(false) } finally { setSaving(false) }
  }
  const sourceBadge = favorite.source_type === 'postcard'
    ? favorite.postcard_type === 'mushroom' ? '🍄' : favorite.postcard_type === 'flower' ? '🌸' : '🙈'
    : favorite.source_type === 'purespot' ? '🌿' : null

  return (
    <Paper ref={setNodeRef} style={style} withBorder p="sm" radius="sm">
      {editing ? (
        <Stack gap="sm">
          <TextInput label={t('favorites.rename')} value={name} maxLength={80} autoFocus onChange={(event) => setName(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') void handleSave(); if (event.key === 'Escape') setEditing(false) }} />
          <Select
            label={t('favorites.group')}
            value={group || '__ungrouped__'}
            onChange={(value) => setGroup(value === '__ungrouped__' ? '' : (value ?? ''))}
            data={[
              { value: '__ungrouped__', label: t('favorites.ungrouped') },
              ...groups.filter(Boolean).map((value) => ({ value, label: value })),
            ]}
            allowDeselect={false}
            maxDropdownHeight={220}
            comboboxProps={{ withinPortal: false }}
          />
          <Textarea label={t('favorites.notes_placeholder')} value={notes} maxLength={200} placeholder={t('favorites.notes_placeholder')} minRows={2} onChange={(event) => setNotes(event.currentTarget.value)} />
          <Group justify="flex-end">
            <Button variant="default" size="xs" leftSection={<IconX size={14} />} onClick={() => setEditing(false)} disabled={saving}>{t('favorites.cancel')}</Button>
            <Button size="xs" leftSection={<IconDeviceFloppy size={14} />} onClick={() => void handleSave()} loading={saving} disabled={!name.trim()}>{t('favorites.save')}</Button>
          </Group>
        </Stack>
      ) : (
        <Group wrap="nowrap" gap="xs" align="center">
          {sortMode === 'manual' && <Tooltip label={t('favorites.drag_hint')}><ActionIcon variant="subtle" color="gray" aria-label={t('favorites.drag_hint')} {...attributes} {...listeners}><IconGripVertical size={17} /></ActionIcon></Tooltip>}
          {favorite.source_type && (
            <div style={{ width: 48, height: 48, position: 'relative', flex: '0 0 auto', borderRadius: 9, overflow: 'hidden', background: 'var(--mantine-color-gray-1)', display: 'grid', placeItems: 'center', fontSize: 22 }}>
              <span>{favorite.decor_type ? '🌿' : sourceBadge}</span>
              {favorite.source_type === 'postcard' && favorite.source_id !== null && (
                <img src={pikminPostcardImageUrl(favorite.source_id)} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={(event) => { event.currentTarget.style.display = 'none' }} />
              )}
              <span style={{ position: 'absolute', right: 1, bottom: 1, width: 19, height: 19, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.92)', fontSize: 12 }}>{sourceBadge}</span>
            </div>
          )}
          <UnstyledButton style={{ flex: 1, minWidth: 0 }} onClick={() => onSelect(favorite.lat, favorite.lng)}>
            <Stack gap={2}>
              <Text size="sm" fw={500} truncate>{favorite.name}</Text>
              {favorite.source_type === 'purespot' && favorite.decor_type && <Text size="xs" c="dimmed">{favorite.decor_type}</Text>}
              {favorite.notes && <Text size="xs" c="dimmed" lineClamp={1}>{favorite.notes}</Text>}
              <Text size="xs" c="dimmed" ff="monospace">{favorite.lat.toFixed(5)}, {favorite.lng.toFixed(5)}</Text>
            </Stack>
          </UnstyledButton>
          <Group gap={2} wrap="nowrap">
            <Tooltip label={teleportDisabledReason || `${t('teleport.action.set_location')} · ${teleportDeviceName}`}>
              <span><ActionIcon variant="subtle" color="blue" aria-label={`${t('teleport.action.set_location')}：${favorite.name}`} disabled={Boolean(teleportDisabledReason) || teleportingFavoriteId !== null} loading={teleportingFavoriteId === favorite.id} onClick={() => { void onTeleportFavorite(favorite) }}><IconLocation size={16} stroke={1.8} /></ActionIcon></span>
            </Tooltip>
            <Tooltip label={t('favorites.rename')}><ActionIcon variant="subtle" color="gray" aria-label={t('favorites.rename')} onClick={resetAndEdit}><IconPencil size={16} /></ActionIcon></Tooltip>
            <Tooltip label={t('favorites.delete')}><ActionIcon variant="subtle" color="red" aria-label={t('favorites.delete')} onClick={() => onDelete(favorite)}><IconTrash size={16} /></ActionIcon></Tooltip>
          </Group>
        </Group>
      )}
    </Paper>
  )
}
