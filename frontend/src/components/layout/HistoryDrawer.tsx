import { useEffect, useState } from 'react'
import { Badge, Divider, Drawer, Group, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconHistory } from '@tabler/icons-react'
import { listHistory, type HistoryEntry } from '../../services/api'
import { useI18n } from '../../i18n'
import { formatRelativeTime } from './relativeTime'

type Props = { isOpen: boolean; onClose: () => void; onFlyTo: (lat: number, lng: number) => void }
const KIND_KEY: Record<string, string> = { teleport: 'mode.teleport', navigate: 'mode.navigate', route_loop: 'mode.route_loop', multi_stop: 'mode.multi_stop', random_walk: 'mode.random_walk', joystick: 'mode.joystick' }

export function HistoryDrawer({ isOpen, onClose, onFlyTo }: Props) {
  const { t, lang } = useI18n()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    listHistory().then(setEntries).catch(() => {}).finally(() => setLoading(false))
  }, [isOpen])

  return (
    <Drawer opened={isOpen} onClose={onClose} position="right" size={400} title={<Group gap="xs"><IconHistory size={18} stroke={1.75} /><Text fw={600}>{t('history.title')}</Text><Badge variant="light" size="sm">{entries.length} {t('history.count')}</Badge></Group>} aria-label={t('history.title')}>
      <Stack gap={0}>
        {loading && <Text c="dimmed" size="sm">{t('generic.working')}</Text>}
        {!loading && entries.length === 0 && <Text c="dimmed" size="sm">{t('history.empty')}</Text>}
        {!loading && entries.map((entry, index) => (
          <Stack gap={0} key={`${entry.ts}-${index}`}>
            {index > 0 && <Divider />}
            <UnstyledButton py="sm" onClick={() => { onFlyTo(entry.lat, entry.lng); onClose() }}>
              <Group justify="space-between" wrap="nowrap" align="center">
                <Stack gap={2} miw={0}>
                  <Text size="sm" fw={500} truncate>{entry.lat.toFixed(5)}, {entry.lng.toFixed(5)}</Text>
                  <Badge variant="light" size="xs" w="fit-content">{t((KIND_KEY[entry.kind] ?? 'mode.teleport') as Parameters<typeof t>[0])}</Badge>
                </Stack>
                <Text size="xs" c="dimmed" flex="0 0 auto">{formatRelativeTime(entry.ts, lang)}</Text>
              </Group>
            </UnstyledButton>
          </Stack>
        ))}
      </Stack>
    </Drawer>
  )
}
