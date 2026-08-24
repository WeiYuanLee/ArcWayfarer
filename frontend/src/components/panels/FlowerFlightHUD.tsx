import { ActionIcon, Alert, Badge, Button, Group, Paper, Progress, Stack, Text, Tooltip } from '@mantine/core'
import { IconAlertCircle, IconPlayerPause, IconPlayerPlay, IconPlayerSkipForward, IconPlayerStop } from '@tabler/icons-react'
import { useT } from '../../i18n'
import type { FlowerProgress } from '../../hooks/useWebSocket'

type Props = {
  progress: FlowerProgress | null
  isRunning: boolean
  isPaused: boolean
  isBusy: boolean
  connected?: boolean
  onPauseResume: () => void
  onSkip: () => void
  onStop: () => void
}

/** Compact status view for Flower sessions. Progress is intentionally sourced
 * from the flower_progress websocket event, not inferred from stop_index. */
export function FlowerFlightHUD({ progress, isRunning, isPaused, isBusy, connected = true, onPauseResume, onSkip, onStop }: Props) {
  const t = useT()
  const flower = Math.max(1, progress?.flowerIndex ?? 1)
  const totalFlowers = Math.max(flower, progress?.totalFlowers ?? 1)
  const circle = Math.max(1, progress?.circle ?? 1)
  const totalCircles = Math.max(circle, progress?.totalCircles ?? 1)
  const pct = Math.round((((flower - 1) * totalCircles + circle) / (totalFlowers * totalCircles)) * 100)
  const phaseKey = progress?.phase || 'approach'
  const phaseLabels: Record<string, string> = {
    approach: '前往花朵',
    circle: '繞圈中',
    pre_wait: '抵達前等待',
    post_wait: '完成後等待',
    returning: '回到起點',
  }
  const phase = phaseLabels[phaseKey] || phaseKey

  return <Stack gap="md" className="active-flight-hud flower-flight-hud">
    {!connected && <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />}>{t('connection.reconnecting')}</Alert>}
    <Paper withBorder p="sm" radius="md" bg="var(--aw-surface-raised)">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap={6}><span className={`active-flight-state-dot${isPaused ? ' paused' : ''}`} /><Text size="xs" fw={700} c={isPaused ? 'yellow' : 'blue'}>{t(isPaused ? 'hud.paused' : 'hud.running')}</Text></Group>
          <Badge variant="light" color="green">{flower} / {totalFlowers}</Badge>
        </Group>
        <Progress value={pct} size="sm" radius="xl" />
        <Group justify="space-between" gap="xs">
          <Text size="sm" fw={600}>第 {flower} 朵 · 第 {circle} / {totalCircles} 圈</Text>
          <Text size="xs" c="dimmed">{phase}</Text>
        </Group>
      </Stack>
    </Paper>
    <Group className="playback-controls-row" gap="xs" wrap="nowrap">
      <Button fullWidth loading={isBusy} onClick={onPauseResume} leftSection={isRunning ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}>{t(isRunning ? 'playback.pause' : 'playback.resume')}</Button>
      <Tooltip label="跳過此花"><ActionIcon variant="light" color="orange" size="lg" disabled={isBusy} onClick={onSkip} aria-label="跳過此花"><IconPlayerSkipForward size={17} /></ActionIcon></Tooltip>
      <Tooltip label={t('playback.stop')}><ActionIcon variant="light" color="red" size="lg" disabled={isBusy} onClick={onStop} aria-label={t('playback.stop')}><IconPlayerStop size={17} /></ActionIcon></Tooltip>
    </Group>
  </Stack>
}
