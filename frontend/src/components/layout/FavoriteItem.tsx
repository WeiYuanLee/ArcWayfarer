import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ActionIcon, Button, Group, Paper, Stack, Text, TextInput, Textarea, Tooltip, UnstyledButton } from '@mantine/core'
import { IconDeviceFloppy, IconGripVertical, IconPencil, IconTrash, IconX } from '@tabler/icons-react'
import { useT } from '../../i18n'
import type { Favorite } from '../../services/api'

type Props = { favorite: Favorite; sortMode: 'manual' | 'name' | 'date'; groups: string[]; onSelect: (lat: number, lng: number) => void; onUpdate: (id: string, patch: { name?: string; group?: string; notes?: string }) => Promise<Favorite>; onDelete: (favorite: Favorite) => void }

export function FavoriteItem({ favorite, sortMode, groups, onSelect, onUpdate, onDelete }: Props) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(favorite.name)
  const [group, setGroup] = useState(favorite.group)
  const [notes, setNotes] = useState(favorite.notes)
  const [saving, setSaving] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: favorite.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  const resetAndEdit = () => { setName(favorite.name); setGroup(favorite.group); setNotes(favorite.notes); setEditing(true) }
  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try { await onUpdate(favorite.id, { name: name.trim(), group: group.trim(), notes: notes.trim() }); setEditing(false) } finally { setSaving(false) }
  }

  return (
    <Paper ref={setNodeRef} style={style} withBorder p="sm" radius="sm">
      {editing ? (
        <Stack gap="sm">
          <TextInput label={t('favorites.rename')} value={name} maxLength={80} autoFocus onChange={(event) => setName(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') void handleSave(); if (event.key === 'Escape') setEditing(false) }} />
          <TextInput label={t('favorites.new_group')} value={group} maxLength={40} placeholder={t('favorites.group_placeholder')} list="fav-groups-list" onChange={(event) => setGroup(event.currentTarget.value)} />
          <datalist id="fav-groups-list">{groups.filter(Boolean).map((value) => <option key={value} value={value} />)}</datalist>
          <Textarea label={t('favorites.notes_placeholder')} value={notes} maxLength={200} placeholder={t('favorites.notes_placeholder')} minRows={2} onChange={(event) => setNotes(event.currentTarget.value)} />
          <Group justify="flex-end">
            <Button variant="default" size="xs" leftSection={<IconX size={14} />} onClick={() => setEditing(false)} disabled={saving}>{t('favorites.cancel')}</Button>
            <Button size="xs" leftSection={<IconDeviceFloppy size={14} />} onClick={() => void handleSave()} loading={saving} disabled={!name.trim()}>{t('favorites.save')}</Button>
          </Group>
        </Stack>
      ) : (
        <Group wrap="nowrap" gap="xs" align="center">
          {sortMode === 'manual' && <Tooltip label={t('favorites.drag_hint')}><ActionIcon variant="subtle" color="gray" aria-label={t('favorites.drag_hint')} {...attributes} {...listeners}><IconGripVertical size={17} /></ActionIcon></Tooltip>}
          <UnstyledButton style={{ flex: 1, minWidth: 0 }} onClick={() => onSelect(favorite.lat, favorite.lng)}>
            <Stack gap={2}>
              <Text size="sm" fw={500} truncate>{favorite.name}</Text>
              {favorite.notes && <Text size="xs" c="dimmed" lineClamp={1}>{favorite.notes}</Text>}
              <Text size="xs" c="dimmed" ff="monospace">{favorite.lat.toFixed(5)}, {favorite.lng.toFixed(5)}</Text>
            </Stack>
          </UnstyledButton>
          <Group gap={2} wrap="nowrap">
            <Tooltip label={t('favorites.rename')}><ActionIcon variant="subtle" color="gray" aria-label={t('favorites.rename')} onClick={resetAndEdit}><IconPencil size={16} /></ActionIcon></Tooltip>
            <Tooltip label={t('favorites.delete')}><ActionIcon variant="subtle" color="red" aria-label={t('favorites.delete')} onClick={() => onDelete(favorite)}><IconTrash size={16} /></ActionIcon></Tooltip>
          </Group>
        </Group>
      )}
    </Paper>
  )
}
