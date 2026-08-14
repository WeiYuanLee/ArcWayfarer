import { useEffect, useState } from 'react'
import { ActionIcon, Button, Group, Modal, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { IconStar, IconStarFilled } from '@tabler/icons-react'
import { addFavorite, listFavorites } from '../../services/api'
import { useT } from '../../i18n'
import type { LatLng } from './types'

type Props = {
  point: LatLng | null
}

export function FavoriteButton({ point }: Props) {
  const t = useT()
  const [added, setAdded] = useState(false)
  const [isNaming, setIsNaming] = useState(false)
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [existingGroups, setExistingGroups] = useState<string[]>([])
  useEffect(() => {
    if (isNaming) {
      listFavorites()
        .then((favs) => {
          const groups = Array.from(new Set(favs.map((f) => f.group).filter(Boolean))).sort()
          setExistingGroups(groups)
        })
        .catch(() => {})
    }
  }, [isNaming])

  function handleOpenNaming() {
    if (!point) return
    setName('')
    setGroup('')
    setIsNaming(true)
  }

  async function handleAdd() {
    if (!point || !name.trim()) return
    try {
      await addFavorite({ name: name.trim(), lat: point.lat, lng: point.lng, group: group.trim() })
      setAdded(true)
      setIsNaming(false)
      setTimeout(() => setAdded(false), 1500)
    } catch {
      // ignore, non-critical
    }
  }

  return (
    <>
      <Tooltip label={t('favorites.add')}>
        <ActionIcon variant="subtle" color="yellow" disabled={!point} onClick={handleOpenNaming} aria-label={t('favorites.add')}>
          {added ? <IconStarFilled size={17} /> : <IconStar size={17} />}
        </ActionIcon>
      </Tooltip>
      <Modal opened={isNaming && !!point} onClose={() => setIsNaming(false)} title={t('favorites.name_title')} centered size="sm">
        {point && <form onSubmit={(event) => { event.preventDefault(); void handleAdd() }}>
          <Stack gap="sm">
            <Text size="sm" c="dimmed">{point.lat.toFixed(6)}, {point.lng.toFixed(6)}</Text>
            <TextInput autoFocus value={name} maxLength={80} onChange={(event) => setName(event.currentTarget.value)} placeholder={t('favorites.name_placeholder')} />
            <TextInput value={group} maxLength={40} onChange={(event) => setGroup(event.currentTarget.value)} placeholder={t('favorites.group_placeholder')} list="fav-add-groups" />
            <datalist id="fav-add-groups">{existingGroups.map((item) => <option key={item} value={item} />)}</datalist>
            <Group justify="flex-end"><Button variant="default" onClick={() => setIsNaming(false)}>{t('favorites.cancel')}</Button><Button type="submit" disabled={!name.trim()}>{t('favorites.save')}</Button></Group>
          </Stack>
        </form>}
      </Modal>
    </>
  )
}
