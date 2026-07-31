import { useEffect, useState } from 'react'
import { clearLocation, goldDitto, pushHistory, setLocation } from '../../services/api'
import type { LatLng, PanelProps } from './types'
import { EMPTY_OVERLAY } from './types'
import { formatPoint, parsePoint } from './coords'
import { FavoriteButton } from './FavoriteButton'
import { useT } from '../../i18n'

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'success'; message: string } | { kind: 'error'; message: string }

export function TeleportPanel({ deviceId, device, deviceState, point, requestPoint, setOverlay, requestFlyTo }: PanelProps) {
  const t = useT()
  const [target, setTarget] = useState<LatLng | null>(point)
  const [targetText, setTargetText] = useState(formatPoint(point))
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const deviceReady = device?.status === 'ready'
  const canAct = deviceReady && target !== null && status.kind !== 'busy'

  useEffect(() => {
    setTarget(point)
    setTargetText(formatPoint(point))
  }, [point])
  useEffect(() => () => setOverlay(EMPTY_OVERLAY), [setOverlay])

  function handleTextChange(value: string) {
    setTargetText(value)
    const parsed = parsePoint(value)
    if (parsed) setTarget(parsed)
  }

  function handleFocusInput() {
    requestPoint((lat, lng) => {
      setTarget({ lat, lng })
      setTargetText(formatPoint({ lat, lng }))
    })
  }

  function handlePreview() {
    if (!target) return
    setOverlay({
      markers: [{ id: 'teleport-preview', lat: target.lat, lng: target.lng, color: '#4a4af0', label: '●' }],
      path: [],
    })
    requestFlyTo(target.lat, target.lng)
  }

  async function handleSet() {
    if (!deviceId || !target) return
    setStatus({ kind: 'busy' })
    try {
      await setLocation(deviceId, target.lat, target.lng)
      pushHistory({ lat: target.lat, lng: target.lng, kind: 'teleport' }).catch(() => {})
      setStatus({ kind: 'success', message: t('teleport.status.set_success') })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('teleport.status.set_failed') })
    }
  }

  async function handleClear() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      await clearLocation(deviceId)
      setStatus({ kind: 'success', message: t('teleport.status.clear_success') })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('teleport.status.clear_failed') })
    }
  }

  async function handleGoldDitto() {
    if (!deviceId || !target) return
    setStatus({ kind: 'busy' })
    try {
      await goldDitto(deviceId, target.lat, target.lng)
      setStatus({ kind: 'success', message: t('teleport.goldditto.status.success') })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('teleport.goldditto.status.failed') })
    }
  }

  return (
    <div className="panel">
      <h2>{t('teleport.title')}</h2>
      <p className="panel-description">{t('teleport.description')}</p>

      {!deviceId && <p className="panel-hint">{t('panel.hint.select_device')}</p>}
      {deviceId && !deviceReady && (
        <p className="panel-hint warning">{device?.detail ?? t('panel.hint.device_not_ready')}</p>
      )}
      {deviceState === 'navigating' && (
        <p className="panel-hint warning">{t('teleport.hint.navigating')}</p>
      )}

      <div className="coord-input-row">
        <input
          type="text"
          className="coord-input-large"
          placeholder="lat,lng"
          value={targetText}
          onFocus={handleFocusInput}
          onChange={(e) => handleTextChange(e.target.value)}
        />
        <FavoriteButton point={target} />
      </div>

      <div className="panel-actions">
        <button disabled={!target} onClick={handlePreview}>
          {t('teleport.action.preview')}
        </button>
        <button disabled={!canAct} onClick={handleSet}>
          {t('teleport.action.set_location')}
        </button>
        <button disabled={!deviceReady || status.kind === 'busy'} onClick={handleClear}>
          {t('teleport.action.clear')}
        </button>
      </div>

      {status.kind === 'busy' && <p className="panel-status">{t('generic.working')}</p>}
      {status.kind === 'success' && <p className="panel-status ok">{status.message}</p>}
      {status.kind === 'error' && <p className="panel-status error">{status.message}</p>}

      <div className="goldditto-section">
        <div className="goldditto-section-header">
          <span className="goldditto-section-icon">🌼</span>
          <h2>{t('teleport.goldditto.title')}</h2>
        </div>
        <p className="panel-hint">{t('teleport.goldditto.help')}</p>
        <button className="goldditto-button" disabled={!canAct} onClick={handleGoldDitto}>
          {t('teleport.goldditto.action')}
        </button>
      </div>
    </div>
  )
}
