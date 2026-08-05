import { useEffect, useState } from 'react'
import { clearLocation, goldDitto, pushHistory, setLocation } from '../../services/api'
import type { LatLng, PanelProps } from './types'
import { EMPTY_OVERLAY } from './types'
import { formatPoint, parsePoint } from './coords'
import { FavoriteButton } from './FavoriteButton'
import { ModeInfoTooltip } from '../common/ModeInfoTooltip'
import { useT } from '../../i18n'

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'success'; message: string } | { kind: 'error'; message: string }

export function TeleportPanel({ deviceId, device, deviceState, point, livePosition, requestPoint, clearPoint, setOverlay, requestFlyTo }: PanelProps) {
  const t = useT()
  const [target, setTarget] = useState<LatLng | null>(point)
  const [targetText, setTargetText] = useState(formatPoint(point))
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const deviceReady = device?.status === 'ready'
  const isOtherModeActive = deviceState !== 'idle' && deviceState !== 'teleporting'
  const canAct = deviceReady && target !== null && status.kind !== 'busy'

  useEffect(() => {
    setTarget(point)
    setTargetText(formatPoint(point))
  }, [point])

  useEffect(() => {
    if (target) {
      setOverlay({
        markers: [
          {
            id: 'teleport-target',
            lat: target.lat,
            lng: target.lng,
            color: '#4a4af0',
            label: '📍',
            draggable: !isOtherModeActive && status.kind !== 'busy',
            onDragEnd: (lat: number, lng: number) => {
              setTarget({ lat, lng })
              setTargetText(formatPoint({ lat, lng }))
            },
          },
        ],
        path: [],
      })
    } else {
      setOverlay(EMPTY_OVERLAY)
    }
    return () => setOverlay(EMPTY_OVERLAY)
  }, [target, isOtherModeActive, status.kind, setOverlay])

  function handleTextChange(value: string) {
    setStatus({ kind: 'idle' })
    setTargetText(value)
    const parsed = parsePoint(value)
    setTarget(parsed)
  }

  function handleFocusInput() {
    setStatus({ kind: 'idle' })
    requestPoint((lat, lng) => {
      setTarget({ lat, lng })
      setTargetText(formatPoint({ lat, lng }))
    })
  }

  function handlePasteClipboard() {
    setStatus({ kind: 'idle' })
    navigator.clipboard.readText().then((text) => {
      if (!text) return
      handleTextChange(text)
    }).catch(() => {})
  }

  function handleUseCurrentLocation() {
    if (!livePosition) return
    setStatus({ kind: 'idle' })
    setTarget(livePosition)
    setTargetText(formatPoint(livePosition))
  }

  function handlePreview() {
    if (!target) return
    requestFlyTo(target.lat, target.lng)
  }

  async function handleSet() {
    if (!deviceId || !target) return
    setStatus({ kind: 'busy' })
    try {
      await setLocation(deviceId, target.lat, target.lng)
      pushHistory({ lat: target.lat, lng: target.lng, kind: 'teleport' }).catch(() => {})
      setStatus({ kind: 'success', message: t('teleport.status.set_success') })
      requestFlyTo(target.lat, target.lng)
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('teleport.status.set_failed') })
    }
  }

  async function handleClear() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      await clearLocation(deviceId)
      setOverlay(EMPTY_OVERLAY)
      setTarget(null)
      setTargetText('')
      clearPoint?.()
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
      <div className="panel-header-row">
        <h2>{t('teleport.title')}</h2>
        <ModeInfoTooltip description={t('teleport.description')} />
      </div>

      {!deviceId && <p className="panel-hint">{t('panel.hint.select_device')}</p>}
      {deviceId && !deviceReady && (
        <p className="panel-hint warning">{device?.detail ?? t('panel.hint.device_not_ready')}</p>
      )}
      {isOtherModeActive && (
        <p className="panel-hint warning">{t('teleport.hint.navigating')}</p>
      )}

      <div className="input-favorite-wrapper">
        <input
          type="text"
          className="coord-input-large"
          placeholder="lat, lng or Google Maps URL"
          value={targetText}
          onFocus={handleFocusInput}
          onChange={(e) => handleTextChange(e.target.value)}
        />
        <div className="inside-favorite-action">
          <FavoriteButton point={target} />
        </div>
      </div>

      <div className="panel-quick-actions">
        <button className="swap-button" onClick={handlePasteClipboard} title={t('teleport.action.paste')}>
          {t('teleport.action.paste')}
        </button>
        {livePosition && (
          <button className="swap-button" onClick={handleUseCurrentLocation} title={t('teleport.action.my_location')}>
            {t('teleport.action.my_location')}
          </button>
        )}
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

      <details className="goldditto-details">
        <summary className="goldditto-summary">{t('teleport.goldditto.title')}</summary>
        <div className="goldditto-content">
          <p className="panel-hint">{t('teleport.goldditto.help')}</p>
          <button className="goldditto-button" disabled={!canAct} onClick={handleGoldDitto}>
            {t('teleport.goldditto.action')}
          </button>
        </div>
      </details>
    </div>
  )
}
