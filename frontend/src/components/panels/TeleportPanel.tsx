import { useEffect, useState } from 'react'
import { Button, Group, TextInput } from '@mantine/core'
import { clearLocation, goldDitto, pushHistory, setLocation } from '../../services/api'
import type { LatLng, PanelProps } from './types'
import { EMPTY_OVERLAY } from './types'
import { formatPoint, parsePoint } from './coords'
import { FavoriteButton } from './FavoriteButton'
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu'
import { ModeInfoTooltip } from '../common/ModeInfoTooltip'
import { showToast } from '../common/Toast'
import { useT } from '../../i18n'

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'success'; message: string } | { kind: 'error'; message: string }

export function TeleportPanel({ deviceId, device, deviceState, point, livePosition, requestPoint, clearPoint, setPoint, requestFlyTo, setOverlay }: PanelProps) {
  const t = useT()
  const [target, setTarget] = useState<LatLng | null>(point)
  const [targetText, setTargetText] = useState(formatPoint(point))
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    title?: string
    items: ContextMenuItem[]
  } | null>(null)

  const deviceReady = device?.status === 'ready'
  const isOtherModeActive = deviceState !== 'idle' && deviceState !== 'teleporting'
  const canAct = deviceReady && target !== null && status.kind !== 'busy'

  useEffect(() => {
    setTarget(point)
    setTargetText(formatPoint(point))
  }, [point])

  useEffect(() => {
    setOverlay({
      markers: [],
      path: [],
      onMapContextMenu: ({ lat, lng, clientX, clientY }) => {
        const clickedPoint = { lat, lng }
        setContextMenu({
          x: clientX,
          y: clientY,
          title: `地圖位置 (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          items: [
            {
              id: 'set-target',
              label: t('contextmenu.set_target'),
              onClick: () => {
                setTarget(clickedPoint)
                setTargetText(formatPoint(clickedPoint))
                setPoint(clickedPoint)
              },
            },
            {
              id: 'teleport-here',
              label: t('contextmenu.teleport_here'),
              disabled: deviceState !== 'idle' || !deviceId,
              onClick: async () => {
                if (!deviceId) return
                try {
                  await setLocation(deviceId, lat, lng)
                  pushHistory({ lat, lng, kind: 'teleport' }).catch(() => {})
                  setPoint(clickedPoint)
                  setTarget(clickedPoint)
                  setTargetText(formatPoint(clickedPoint))
                  requestFlyTo(lat, lng)
                } catch (e) {
                  setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('teleport.status.set_failed') })
                }
              },
            },
            {
              id: 'copy-map-coords',
              label: t('contextmenu.copy_coords_short'),
              onClick: () => {
                navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)
                showToast(t('toast.copied_coords'))
              },
            },
          ],
        })
      },
    })
    return () => setOverlay(EMPTY_OVERLAY)
  }, [deviceId, deviceState, requestFlyTo, setOverlay, setPoint, t])

  function handleTextChange(value: string) {
    setStatus({ kind: 'idle' })
    setTargetText(value)
    setTarget(parsePoint(value))
  }

  function handleInputBlur() {
    const parsed = parsePoint(targetText)
    if (parsed) setPoint(parsed)
    else if (targetText.trim() === '') setPoint(null)
  }

  function handleFocusInput() {
    setStatus({ kind: 'idle' })
    requestPoint((lat, lng) => {
      const nextPoint = { lat, lng }
      setTarget(nextPoint)
      setTargetText(formatPoint(nextPoint))
      setPoint(nextPoint)
    })
  }

  function handlePasteClipboard() {
    setStatus({ kind: 'idle' })
    navigator.clipboard.readText().then((text) => {
      if (!text) return
      handleTextChange(text)
      const parsed = parsePoint(text)
      if (parsed) setPoint(parsed)
    }).catch(() => {})
  }

  function handleUseCurrentLocation() {
    if (!livePosition) return
    setStatus({ kind: 'idle' })
    setTarget(livePosition)
    setTargetText(formatPoint(livePosition))
    setPoint(livePosition)
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
      setTarget(null)
      setTargetText('')
      setPoint(null)
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

      <TextInput
        label={t('teleport.title')}
        placeholder="lat, lng or Google Maps URL"
        value={targetText}
        onFocus={handleFocusInput}
        onChange={(event) => handleTextChange(event.currentTarget.value)}
        onBlur={handleInputBlur}
        rightSection={<FavoriteButton point={target} />}
      />

      <Group gap="xs" mt="sm">
        <Button size="compact-sm" variant="default" onClick={handlePasteClipboard} title={t('teleport.action.paste')}>
          {t('teleport.action.paste')}
        </Button>
        {livePosition && (
          <Button size="compact-sm" variant="default" onClick={handleUseCurrentLocation} title={t('teleport.action.my_location')}>
            {t('teleport.action.my_location')}
          </Button>
        )}
      </Group>

      <Group grow mt="lg">
        <Button variant="default" disabled={!target} onClick={handlePreview}>
          {t('teleport.action.preview')}
        </Button>
        <Button disabled={!canAct} loading={status.kind === 'busy'} onClick={handleSet}>
          {t('teleport.action.set_location')}
        </Button>
        <Button color="red" variant="light" disabled={!deviceReady || status.kind === 'busy'} onClick={handleClear}>
          {t('teleport.action.clear')}
        </Button>
      </Group>

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

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          title={contextMenu.title}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
