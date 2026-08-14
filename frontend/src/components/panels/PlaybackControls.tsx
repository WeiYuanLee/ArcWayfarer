import { useT } from '../../i18n'
import { ActionIcon, Button, Group, Tooltip } from '@mantine/core'
import { IconPlayerPause, IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react'

type Props = {
  canStart: boolean
  isActive: boolean
  isPaused: boolean
  isBusy: boolean
  onStart: () => void
  onPauseResume: () => void
  onStop: () => void
}

export function PlaybackControls({ canStart, isActive, isPaused, isBusy, onStart, onPauseResume, onStop }: Props) {
  const t = useT()
  const isRunning = isActive && !isPaused
  const primaryLabel = t(isRunning ? 'playback.pause' : isPaused ? 'playback.resume' : 'playback.start')
  const primaryDisabled = isRunning || isPaused ? isBusy : !canStart

  return (
    <Group className="playback-controls-row" gap="xs" wrap="nowrap">
      <Button fullWidth loading={isBusy} disabled={primaryDisabled} onClick={isActive ? onPauseResume : onStart} leftSection={isRunning ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}>
        {primaryLabel}
      </Button>
      <Tooltip label={t('playback.stop')}>
        <ActionIcon color="red" variant="light" size="lg" disabled={!isActive || isBusy} onClick={onStop} aria-label={t('playback.stop')}>
          <IconPlayerStop size={17} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}
