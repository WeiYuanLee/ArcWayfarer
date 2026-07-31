import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { pushHistory, startJoystick, stopJoystick, type NavMode } from '../../services/api'
import type { PanelProps } from './types'
import { SpeedSlider } from './SpeedSlider'
import { JoystickPad } from './JoystickPad'
import { useJoystickKeyboard } from '../../hooks/useJoystickKeyboard'
import { useT } from '../../i18n'

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string }

export function JoystickPanel({ deviceId, device, deviceState, point, livePosition, sendWs }: PanelProps) {
  const t = useT()
  const [navMode, setNavMode] = useState<NavMode>('walk')
  const [speedKmh, setSpeedKmh] = useState(5)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const deviceReady = device?.status === 'ready'
  const isActive = deviceState === 'joystick'
  const isBusy = status.kind === 'busy'
  const startPoint = point ?? livePosition
  const canStart = deviceReady && !isActive && startPoint !== null && !isBusy

  const handleMove = useCallback(
    (direction: number, intensity: number) => {
      if (!deviceId) return
      sendWs('joystick_input', { direction, intensity }, deviceId)
    },
    [deviceId, sendWs]
  )

  useJoystickKeyboard(handleMove, isActive)

  async function handleStart() {
    if (!deviceId || !startPoint) return
    setStatus({ kind: 'busy' })
    try {
      await startJoystick(deviceId, navMode, startPoint.lat, startPoint.lng, speedKmh)
      pushHistory({ lat: startPoint.lat, lng: startPoint.lng, kind: 'joystick' }).catch(() => {})
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('joystick.status.failed_start') })
    }
  }

  async function handleStop() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      await stopJoystick(deviceId)
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('joystick.status.failed_stop') })
    }
  }

  return (
    <div className="panel">
      <h2>{t('joystick.title')}</h2>
      <p className="panel-description">{t('joystick.description')}</p>

      {!deviceId && <p className="panel-hint">{t('panel.hint.select_device')}</p>}
      {deviceId && !deviceReady && (
        <p className="panel-hint warning">{device?.detail ?? t('panel.hint.device_not_ready')}</p>
      )}
      {deviceId && deviceReady && !isActive && !startPoint && (
        <p className="panel-hint warning">{t('joystick.hint.need_anchor')}</p>
      )}

      <SpeedSlider
        valueKmh={speedKmh}
        navMode={navMode}
        onChange={setSpeedKmh}
        onNavModeChange={setNavMode}
        disabled={isActive}
      />

      <div className="panel-actions icon-actions">
        {!isActive ? (
          <button disabled={!canStart} onClick={handleStart} title={t('playback.start')}>
            ▶
          </button>
        ) : (
          <button disabled={isBusy} onClick={handleStop} title={t('playback.stop')}>
            ⏹
          </button>
        )}
      </div>

      {status.kind === 'busy' && <p className="panel-status">{t('generic.working')}</p>}
      {isActive && <p className="panel-status ok">{t('joystick.status.active')}</p>}
      {status.kind === 'error' && <p className="panel-status error">{status.message}</p>}

      {isActive &&
        createPortal(
          <div className="joystick-float-dock">
            <JoystickPad onMove={handleMove} />
          </div>,
          document.body
        )}
    </div>
  )
}
