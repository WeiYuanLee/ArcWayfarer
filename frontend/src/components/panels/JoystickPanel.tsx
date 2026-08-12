import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { pushHistory, startJoystick, stopJoystick, type NavMode } from '../../services/api'
import type { PanelProps } from './types'
import { SpeedSlider } from './SpeedSlider'
import { JoystickPad } from './JoystickPad'
import { useJoystickKeyboard } from '../../hooks/useJoystickKeyboard'
import { ModeInfoTooltip } from '../common/ModeInfoTooltip'
import { useT } from '../../i18n'

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string }
type SubTab = 'basic' | 'dynamic'
const DYNAMIC_MAX_SPEED_KMH = 60

export function JoystickPanel({ deviceId, device, deviceState, point, livePosition, sendWs }: PanelProps) {
  const t = useT()
  const [subTab, setSubTab] = useState<SubTab>('basic')
  const [navMode, setNavMode] = useState<NavMode>('walk')
  const [speedKmh, setSpeedKmh] = useState(5)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const deviceReady = device?.status === 'ready'
  const isActive = deviceState === 'joystick'
  const isDynamic = subTab === 'dynamic'
  const isBusy = status.kind === 'busy'

  // Auto fallback to livePosition if point is null
  const startPoint = point ?? livePosition
  const canStart = deviceReady && !isActive && startPoint !== null && !isBusy

  const handleMove = useCallback(
    (direction: number, intensity: number) => {
      if (!deviceId) return
      sendWs('joystick_input', { direction, intensity }, deviceId)
    },
    [deviceId, sendWs]
  )

  useJoystickKeyboard(handleMove, isActive, isDynamic)

  async function handleStart() {
    if (!deviceId || !startPoint) return
    setStatus({ kind: 'busy' })
    try {
      await startJoystick(
        deviceId,
        navMode,
        startPoint.lat,
        startPoint.lng,
        isDynamic ? DYNAMIC_MAX_SPEED_KMH : speedKmh
      )
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
      <div className="panel-header-row">
        <h2>{t('joystick.title')}</h2>
        <ModeInfoTooltip description={t('joystick.description')} />
      </div>

      {!deviceId && <p className="panel-hint">{t('panel.hint.select_device')}</p>}
      {deviceId && !deviceReady && (
        <p className="panel-hint warning">{device?.detail ?? t('panel.hint.device_not_ready')}</p>
      )}
      {deviceId && deviceReady && !isActive && !startPoint && (
        <p className="panel-hint warning">{t('joystick.hint.need_anchor')}</p>
      )}

      {/* Sub-Tab Bar for Basic vs Dynamic mode setup */}
      <div className="panel-sub-tabs">
        <button
          className={`sub-tab ${subTab === 'basic' ? 'active' : ''}`}
          onClick={() => setSubTab('basic')}
          disabled={isActive}
        >
          {t('joystick.tab.basic')}
        </button>
        <button
          className={`sub-tab ${subTab === 'dynamic' ? 'active' : ''}`}
          onClick={() => setSubTab('dynamic')}
          disabled={isActive}
        >
          {t('joystick.tab.dynamic')}
        </button>
      </div>

      {subTab === 'basic' ? (
        <SpeedSlider
          valueKmh={speedKmh}
          navMode={navMode}
          onChange={setSpeedKmh}
          onNavModeChange={setNavMode}
          disabled={isActive}
        />
      ) : (
        <div className="dynamic-settings-group">
          <div className="setting-row">
            <span className="setting-label">{t('joystick.dynamic.speed_range')}</span>
            <span className="setting-val-badge">0–{DYNAMIC_MAX_SPEED_KMH} km/h</span>
          </div>
          <p className="panel-hint">{t('joystick.dynamic.description')}</p>
        </div>
      )}

      <div className="panel-actions icon-actions">
        {!isActive ? (
          <button disabled={!canStart} onClick={handleStart} title={t('joystick.action.start')}>
            {t('joystick.action.start')}
          </button>
        ) : (
          <button disabled={isBusy} onClick={handleStop} title={t('joystick.action.stop')}>
            {t('joystick.action.stop')}
          </button>
        )}
      </div>

      {status.kind === 'busy' && <p className="panel-status">{t('generic.working')}</p>}
      {isActive && <p className="panel-status ok">{t('joystick.status.active')}</p>}
      {status.kind === 'error' && <p className="panel-status error">{status.message}</p>}

      {isActive &&
        createPortal(
          <div className="joystick-float-dock">
            <JoystickPad
              onMove={handleMove}
              dynamic={isDynamic}
              maxSpeedKmh={isDynamic ? DYNAMIC_MAX_SPEED_KMH : speedKmh}
            />
          </div>,
          document.body
        )}
    </div>
  )
}
