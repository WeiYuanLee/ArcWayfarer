import type { ReactNode } from 'react'
import { useT } from '../../i18n'
import { ActionIcon, Alert, Button, Group, Paper, Progress, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core'
import { IconAlertCircle, IconClock, IconPlayerPause, IconPlayerPlay, IconPlayerStop, IconRoute, IconSpeedboat } from '@tabler/icons-react'
import { calculateRemainingDistanceMeters, calculateRouteProgressPct } from './coords'
import type { LatLng } from './types'

type Props = {
  isRunning: boolean
  isPaused: boolean
  isBusy: boolean
  currentIndex: number | null
  totalPoints: number
  liveSpeedMps: number | null
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
  liveSpeedMps,
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
  const remainingDistanceMeters = calculateRemainingDistanceMeters(routePath, waypoints, livePosition, currentIndex, isLoop)
  const speedKmh = liveSpeedMps === null ? null : liveSpeedMps * 3.6
  const etaText = liveEtaSeconds === null ? null : liveEtaSeconds < 60
    ? (t('hud.eta_seconds') as string).replace('{seconds}', String(Math.round(liveEtaSeconds)))
    : (t('hud.eta_minutes') as string).replace('{minutes}', String(Math.ceil(liveEtaSeconds / 60)))
  const distanceText = remainingDistanceMeters === null ? null
    : remainingDistanceMeters < 1000
      ? `${Math.round(remainingDistanceMeters)} m`
      : `${(remainingDistanceMeters / 1000).toFixed(2)} km`


  return (
    <Stack gap="md" className="active-flight-hud">
      {!connected && (
        <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />}>
          {t('connection.reconnecting')}
        </Alert>
      )}

      <Paper withBorder p="sm" radius="md" bg="var(--aw-surface-raised)" className="active-flight-summary">
        <Stack gap="sm">
          <Group justify="space-between" gap="xs" wrap="nowrap">
            <Group gap={6} wrap="nowrap">
              <span className={`active-flight-state-dot${isPaused ? ' paused' : ''}`} />
              <Text size="xs" fw={700} c={isPaused ? 'yellow' : 'blue'}>{t(isPaused ? 'hud.paused' : 'hud.running')}</Text>
            </Group>
            <Text size="sm" fw={600} ta="right" lineClamp={1}>
            {legLabel || `Point #${current} → Point #${next}`}
            </Text>
          </Group>

          <Progress value={pct} size="sm" radius="xl" />

          <SimpleGrid cols={2} spacing="xs" className="active-flight-metrics">
            {distanceText && <Metric icon={<IconRoute size={15} />} label={t('hud.remaining_distance')} value={distanceText} />}
            {etaText && <Metric icon={<IconClock size={15} />} label={t('hud.estimated_time')} value={etaText} />}
            {speedKmh !== null && <Metric icon={<IconSpeedboat size={15} />} label={t('hud.current_speed')} value={`${speedKmh.toFixed(speedKmh < 10 ? 1 : 0)} km/h`} />}
            <Metric label={t('hud.stop_progress')} value={`${current} / ${totalPoints} · ${pct}%`} />
          </SimpleGrid>
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

function Metric({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="active-flight-metric">
      <Group gap={5} wrap="nowrap">
        {icon && <span className="active-flight-metric-icon">{icon}</span>}
        <Text size="xs" c="dimmed">{label}</Text>
      </Group>
      <Text size="sm" fw={650}>{value}</Text>
    </div>
  )
}
