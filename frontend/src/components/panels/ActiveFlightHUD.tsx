import { useT } from '../../i18n'
import { ActionIcon, Alert, Button, Group, Paper, Progress, Stack, Text, Tooltip } from '@mantine/core'
import { IconAlertCircle, IconPlayerPause, IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react'
import { calculateRouteProgressPct, formatEta } from './coords'
import type { LatLng } from './types'

type Props = {
  isRunning: boolean
  isPaused: boolean
  isBusy: boolean
  currentIndex: number | null
  totalPoints: number
  liveEtaSeconds: number | null
  livePosition?: LatLng | null
  routePath?: LatLng[]
  waypoints?: (LatLng | null)[]
  isLoop?: boolean
  legLabel?: string
  connected?: boolean
  onPauseResume: () => void
  onStop: () => void
}

export function ActiveFlightHUD({
  isRunning,
  isPaused,
  isBusy,
  currentIndex,
  totalPoints,
  liveEtaSeconds,
  livePosition,
  routePath,
  waypoints,
  isLoop = false,
  legLabel,
  connected = true,
  onPauseResume,
  onStop,
}: Props) {
  const t = useT()
  const current = Math.max(1, Math.min(currentIndex || 1, totalPoints))
  const next = current < totalPoints ? current + 1 : (isLoop ? 1 : current)
  const pct = calculateRouteProgressPct(routePath, waypoints, livePosition, currentIndex, totalPoints, isLoop)


  return (
    <Stack gap="md" className="active-flight-hud">
      {!connected && (
        <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />}>
          {t('connection.reconnecting')}
        </Alert>
      )}

      <Paper withBorder p="sm" radius="md" bg="var(--aw-surface-raised)">
        <Stack gap="sm">
          <Group justify="space-between" gap="xs" wrap="nowrap">
            <Text size="xs" c="dimmed">{t('hud.current_leg')}</Text>
            <Text size="sm" fw={600} c="blue" ta="right">
            {legLabel || `Point #${current} → Point #${next}`}
            </Text>
          </Group>

          <Progress value={pct} size="sm" radius="xl" />

          <Group justify="space-between" gap="xs">
            <Text size="xs" c="dimmed">{t('multistop.stop_progress')} {current} / {totalPoints} ({pct}%)</Text>
            {liveEtaSeconds !== null && <Text size="xs" c="dimmed">ETA {formatEta(liveEtaSeconds)}</Text>}
          </Group>
        </Stack>
      </Paper>

      <Group className="playback-controls-row" gap="xs" wrap="nowrap">
        <Button
          fullWidth
          loading={isBusy}
          onClick={onPauseResume}
          leftSection={isRunning ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
        >
          {t(isRunning ? 'playback.pause' : 'playback.resume')}
        </Button>
        <Tooltip label={t('playback.stop')}>
          <ActionIcon
            variant="light"
            color="red"
            size="lg"
            disabled={isBusy}
            onClick={onStop}
            aria-label={t('playback.stop')}
          >
            <IconPlayerStop size={17} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Stack>
  )
}
