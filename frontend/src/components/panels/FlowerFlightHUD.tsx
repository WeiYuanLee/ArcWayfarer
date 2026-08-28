import { ActionIcon, Alert, Badge, Button, Group, Paper, Progress, Stack, Text, Tooltip } from '@mantine/core'
import { IconAlertCircle, IconClock, IconPlayerPause, IconPlayerPlay, IconPlayerSkipForward, IconPlayerStop } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
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
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!isRunning || isPaused) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [isRunning, isPaused])
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
  const remainingSeconds = Math.max(0, Math.ceil((progress?.etaSeconds ?? 0) - (isPaused ? 0 : (now - (progress?.receivedAt ?? now)) / 1000)))
  const remainingText = remainingSeconds >= 3600
    ? `${Math.floor(remainingSeconds / 3600)}:${String(Math.floor(remainingSeconds % 3600 / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`
    : `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`

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
        <Group gap={5} justify="space-between">
          <Group gap={5}><IconClock size={15} /><Text size="xs" c="dimmed">{progress?.etaScope === 'round' ? '本圈剩餘' : '本次剩餘'}</Text></Group>
          <Text size="sm" fw={700}>{remainingText}</Text>
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
