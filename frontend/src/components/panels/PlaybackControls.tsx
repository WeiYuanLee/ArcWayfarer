import { useT } from '../../i18n'

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
  const primaryIcon = isRunning ? '⏸' : '▶'
  const primaryDisabled = isRunning || isPaused ? isBusy : !canStart

  return (
    <div className="playback-controls-row">
      <button className="playback-btn-primary" disabled={primaryDisabled} onClick={isActive ? onPauseResume : onStart}>
        <span className="playback-btn-icon">{primaryIcon}</span>
        {primaryLabel}
      </button>
      <button className="playback-btn-stop" disabled={!isActive || isBusy} onClick={onStop} title={t('playback.stop')}>
        ⏹
      </button>
    </div>
  )
}
