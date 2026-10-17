import { useEffect, useRef, useState } from 'react'
import { ActionIcon, Badge, Drawer, Group, Loader, Paper, ScrollArea, Stack, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core'
import { IconLocation, IconMapPin, IconSearch, IconX } from '@tabler/icons-react'
import type { PlaceSearchResult } from '../../services/geocoding'
import { useT } from '../../i18n'
import { usePlaceSearch } from '../../hooks/usePlaceSearch'
import { TeleportDevicePicker, type TeleportDeviceSelection } from '../common/TeleportDevicePicker'

export type PlaceTeleportTarget = Pick<PlaceSearchResult, 'id' | 'name' | 'lat' | 'lng'>

type Props = {
  isOpen: boolean
  onClose: () => void
  onSelectPlace: (lat: number, lng: number, placeName: string) => void
  onTeleportPlace: (target: PlaceTeleportTarget) => Promise<void>
  teleportDisabledReason: string | null
  teleportingPlaceId: string | null
  teleportDeviceName: string | null
}

export function PlaceSearchDrawer({
  isOpen,
  onClose,
  onSelectPlace,
  onTeleportPlace,
  teleportDisabledReason,
  teleportingPlaceId,
  teleportDeviceName,
  teleportDevices,
  teleportDeviceId,
  onTeleportDeviceChange,
}: Props & TeleportDeviceSelection) {
  const t = useT()
  const [keyword, setKeyword] = useState('')
  const { results, loading, errorMsg, clearResults } = usePlaceSearch(keyword)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) window.setTimeout(() => searchRef.current?.focus(), 120)
  }, [isOpen])

  function handleSelect(item: PlaceSearchResult) {
    onSelectPlace(item.lat, item.lng, item.name)
    onClose()
  }

  function clearSearch() {
    setKeyword('')
    clearResults()
  }

  return (
    <Drawer
      opened={isOpen}
      onClose={onClose}
      title={(
        <Group gap="sm" wrap="nowrap">
          <Text fw={600}>{t('search.title')}</Text>
          <TeleportDevicePicker
            teleportDevices={teleportDevices}
            teleportDeviceId={teleportDeviceId}
            onTeleportDeviceChange={onTeleportDeviceChange}
          />
        </Group>
      )}
      position="right"
      size="sm"
    >
      <Stack gap="md" h="100%">
        <TextInput
          ref={searchRef}
          value={keyword}
          onChange={(event) => setKeyword(event.currentTarget.value)}
          placeholder={t('search.placeholder')}
          leftSection={<IconSearch size={16} />}
          rightSection={loading ? <Loader size="xs" /> : keyword ? (
            <Tooltip label={t('search.clear')}>
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label={t('search.clear')} onClick={clearSearch}>
                <IconX size={15} />
              </ActionIcon>
            </Tooltip>
          ) : undefined}
          rightSectionPointerEvents={loading ? 'none' : 'all'}
          aria-label={t('search.placeholder')}
        />

        {!keyword.trim() && <Text size="sm" c="dimmed">{t('search.hint')}</Text>}
        {errorMsg && <Text size="sm" c="dimmed">{errorMsg}</Text>}

        {results.length > 0 && (
          <ScrollArea type="auto" style={{ flex: 1 }}>
            <Stack gap="xs" pe="xs">
              {results.map((item) => {
                const teleportId = `place-search:${item.id}`
                return (
                  <Paper key={item.id} className="place-search-result">
                    <Group align="center" wrap="nowrap" gap="xs">
                      <UnstyledButton className="place-search-result-main" onClick={() => handleSelect(item)}>
                        <Group align="flex-start" wrap="nowrap" gap="sm">
                          <IconMapPin size={20} stroke={1.8} className="place-search-result-icon" />
                          <Stack gap={3} style={{ minWidth: 0, flex: 1 }}>
                            <Group justify="space-between" wrap="nowrap" gap="xs">
                              <Text size="sm" fw={600} lineClamp={1}>{item.name}</Text>
                              {item.category && <Badge size="xs" variant="light" color="gray">{item.category}</Badge>}
                            </Group>
                            <Text size="xs" c="dimmed" lineClamp={2}>{item.address}</Text>
                            <Text size="xs" c="dimmed" ff="monospace">{item.lat.toFixed(5)}, {item.lng.toFixed(5)}</Text>
                          </Stack>
                        </Group>
                      </UnstyledButton>
                      <Tooltip label={teleportDisabledReason || `${t('teleport.action.set_location')} · ${teleportDeviceName}`}>
                        <span>
                          <ActionIcon
                            variant="light"
                            color="blue"
                            size="lg"
                            aria-label={`${t('teleport.action.set_location')}：${item.name}`}
                            disabled={Boolean(teleportDisabledReason) || teleportingPlaceId !== null}
                            loading={teleportingPlaceId === teleportId}
                            onClick={() => void onTeleportPlace({ id: teleportId, name: item.name, lat: item.lat, lng: item.lng })}
                          >
                            <IconLocation size={17} stroke={1.8} />
                          </ActionIcon>
                        </span>
                      </Tooltip>
                    </Group>
                  </Paper>
                )
              })}
            </Stack>
          </ScrollArea>
        )}
      </Stack>
    </Drawer>
  )
}
