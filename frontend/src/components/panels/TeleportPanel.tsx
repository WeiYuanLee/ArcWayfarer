import { useEffect, useState } from 'react'
import { Button, Group, SegmentedControl, Stack, Text } from '@mantine/core'
import { clearLocation, finishGoldDitto, goldDitto, pushHistory, setLocation } from '../../services/api'
import type { LatLng, PanelProps } from './types'
import { EMPTY_OVERLAY } from './types'
import { formatPoint, haversineDistanceKm, parsePoint } from './coords'
import { FavoriteButton } from './FavoriteButton'
import { GoldDittoGuide, type GoldDittoPhase } from './GoldDittoGuide'
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu'
import { ModeInfoTooltip } from '../common/ModeInfoTooltip'
import { notify, showToast } from '../common/Toast'
import { deviceStatusMessage } from '../../utils/userFacingError'
import { useT } from '../../i18n'
import { CoordinateField, ModePanelLayout, PanelFooter, PanelNotice, PanelSection } from './ui'

type Status = { kind: 'idle' | 'busy' }

export function TeleportPanel({ deviceId, device, deviceState, point, livePosition, requestPoint, clearPoint, setPoint, requestFlyTo, setOverlay, restoredAt, restoreAll }: PanelProps) {
  const t = useT()
  const [target, setTarget] = useState<LatLng | null>(point)
  const [targetText, setTargetText] = useState(formatPoint(point))
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [teleportMode, setTeleportMode] = useState<'standard' | 'gold'>('standard')
  const [goldOrigin, setGoldOrigin] = useState<LatLng | null>(null)
  const [goldOriginText, setGoldOriginText] = useState('')
  const [goldCountdown, setGoldCountdown] = useState<number | null>(null)
  const [goldFinishing, setGoldFinishing] = useState(false)
  const [goldCompleted, setGoldCompleted] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    title?: string
    items: ContextMenuItem[]
  } | null>(null)

  const deviceReady = device?.status === 'ready'
  const isGoldDittoHolding = deviceState === 'gold_ditto'
  const isOtherModeActive = deviceState !== 'idle' && deviceState !== 'teleporting' && !isGoldDittoHolding
  const canAct = deviceReady && target !== null && status.kind !== 'busy'
  const goldPhase: GoldDittoPhase = goldFinishing
    ? (goldCountdown === null ? 'finishing' : 'countdown')
    : goldCompleted
      ? 'complete'
      : isGoldDittoHolding
        ? 'holding'
        : 'setup'
  const distanceKm = target && livePosition ? haversineDistanceKm(livePosition, target) : null
  const cooldownMinutes = distanceKm === null ? null : Math.min(120, Math.ceil(distanceKm))
  useEffect(() => {
    setTarget(point)
    setTargetText(formatPoint(point))
  }, [point])

  useEffect(() => {
    if (!restoredAt) return
    // The action that initiated the restore owns user feedback. This event is
    // state synchronization only; notifying here duplicates button results.
    setStatus({ kind: 'idle' })
  }, [restoredAt])

  useEffect(() => {
    if (isGoldDittoHolding) {
      setTeleportMode('gold')
      setGoldCompleted(false)
    }
  }, [isGoldDittoHolding])

  useEffect(() => {
    return () => setOverlay(EMPTY_OVERLAY)
  }, [setOverlay])

  useEffect(() => {
    const showGoldOrigin = teleportMode === 'gold' && goldOrigin !== null
    const canEditGoldOrigin = goldPhase === 'setup' || goldPhase === 'complete'
    setOverlay({
      markers: showGoldOrigin ? [{
        id: 'gold-origin',
        lat: goldOrigin.lat,
        lng: goldOrigin.lng,
        color: '#2f9e44',
        label: t('teleport.goldditto.map.origin_marker'),
        title: t('teleport.goldditto.origin_label'),
        draggable: canEditGoldOrigin,
        onDragEnd: (lat, lng) => {
          const origin = { lat, lng }
          setGoldOrigin(origin)
          setGoldOriginText(formatPoint(origin))
        },
      }] : [],
      path: [],
      links: showGoldOrigin && target ? [{
        id: 'gold-origin-to-target',
        from: goldOrigin,
        to: target,
        color: '#2f9e44',
        opacity: 0.7,
        weight: 2,
        dashArray: '6 7',
      }] : [],
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
                  const message = t('teleport.status.set_failed')
                  notify.failure(e, message, { id: `teleport:set:${deviceId}` })
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
  }, [deviceId, deviceState, goldOrigin, goldPhase, requestFlyTo, setOverlay, setPoint, t, target, teleportMode])

  function handleTextChange(value: string) {
    setStatus({ kind: 'idle' })
    if (teleportMode === 'gold') setGoldCompleted(false)
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

  function handleTeleportModeChange(value: string) {
    const nextMode = value as 'standard' | 'gold'
    if (nextMode === 'standard') setGoldCompleted(false)
    if (nextMode === 'gold' && goldOrigin === null && livePosition !== null) {
      setGoldOrigin(livePosition)
      setGoldOriginText(formatPoint(livePosition))
    }
    setTeleportMode(nextMode)
  }

  function handleGoldOriginTextChange(value: string) {
    setGoldOriginText(value)
    setGoldOrigin(parsePoint(value))
  }

  function handleGoldOriginBlur() {
    const parsed = parsePoint(goldOriginText)
    if (parsed) {
      setGoldOrigin(parsed)
      setGoldOriginText(formatPoint(parsed))
    }
  }

  function handlePickGoldOrigin() {
    requestPoint((lat, lng) => {
      const origin = { lat, lng }
      setGoldOrigin(origin)
      setGoldOriginText(formatPoint(origin))
    })
  }

  function handleUseCurrentAsGoldOrigin() {
    if (!livePosition) return
    const origin = { lat: livePosition.lat, lng: livePosition.lng }
    setGoldOrigin(origin)
    setGoldOriginText(formatPoint(origin))
  }

  async function handleSet() {
    if (!deviceId || !target) return
    setStatus({ kind: 'busy' })
    try {
      await setLocation(deviceId, target.lat, target.lng)
      pushHistory({ lat: target.lat, lng: target.lng, kind: 'teleport' }).catch(() => {})
      setStatus({ kind: 'idle' })
      notify.success(t('teleport.status.set_success'), { id: `teleport:set:${deviceId}` })
      requestFlyTo(target.lat, target.lng)
    } catch (e) {
      const message = t('teleport.status.set_failed')
      setStatus({ kind: 'idle' })
      notify.failure(e, message, { id: `teleport:set:${deviceId}` })
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
      setStatus({ kind: 'idle' })
      notify.success(t('teleport.status.clear_success'), { id: `teleport:clear:${deviceId}` })
    } catch (e) {
      const message = t('teleport.status.clear_failed')
      setStatus({ kind: 'idle' })
      notify.failure(e, message, { id: `teleport:clear:${deviceId}` })
    }
  }

  async function handleClearAll() {
    if (!restoreAll) return
    setStatus({ kind: 'busy' })
    const result = await restoreAll()
    if (result.failed > 0) {
      const message = t('teleport.status.clear_all_partial').replace('{count}', String(result.restored)).replace('{failed}', String(result.failed))
      setStatus({ kind: 'idle' })
      notify.warning(message, { id: 'teleport:clear-all' })
      return
    }
    const message = t('teleport.status.clear_all_success').replace('{count}', String(result.restored))
    setStatus({ kind: 'idle' })
    notify.success(message, { id: 'teleport:clear-all' })
  }

  async function handleGoldDittoStart() {
    if (!deviceId || !target) return
    setGoldCompleted(false)
    setStatus({ kind: 'busy' })
    try {
      await goldDitto(deviceId, target.lat, target.lng, goldOrigin)
      pushHistory({ lat: target.lat, lng: target.lng, kind: 'teleport' }).catch(() => {})
      requestFlyTo(target.lat, target.lng)
      setStatus({ kind: 'idle' })
      notify.info(t('teleport.goldditto.status.waiting'), { id: `gold-ditto:start:${deviceId}` })
    } catch (e) {
      const message = t('teleport.goldditto.status.failed')
      setStatus({ kind: 'idle' })
      notify.failure(e, message, { id: `gold-ditto:start:${deviceId}` })
    }
  }

  async function handleGoldDittoRestore() {
    if (!deviceId) return
    setGoldFinishing(true)
    setGoldCompleted(false)
    setStatus({ kind: 'busy' })
    const finishRequest = finishGoldDitto(deviceId)
    setGoldCountdown(3)
    let countdownId: number | undefined
    const countdownDone = new Promise<void>((resolve) => {
      let remaining = 3
      countdownId = window.setInterval(() => {
        remaining -= 1
        if (remaining <= 0) {
          window.clearInterval(countdownId)
          setGoldCountdown(null)
          resolve()
          return
        }
        setGoldCountdown(remaining)
      }, 1000)
    })
    try {
      await Promise.all([finishRequest, countdownDone])
      setGoldCompleted(true)
      setStatus({ kind: 'idle' })
    } catch (e) {
      const message = t('teleport.status.clear_failed')
      setStatus({ kind: 'idle' })
      notify.failure(e, message, { id: `gold-ditto:finish:${deviceId}` })
    } finally {
      if (countdownId !== undefined) window.clearInterval(countdownId)
      setGoldCountdown(null)
      setGoldFinishing(false)
    }
  }

  async function handleGoldDittoCancel() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      await clearLocation(deviceId)
      setGoldCompleted(false)
      setStatus({ kind: 'idle' })
      notify.success(t('teleport.goldditto.status.cancelled'), { id: `gold-ditto:cancel:${deviceId}` })
    } catch (e) {
      const message = t('teleport.status.clear_failed')
      setStatus({ kind: 'idle' })
      notify.failure(e, message, { id: `gold-ditto:cancel:${deviceId}` })
    }
  }

  return (
    <div className="panel">
      <ModePanelLayout
        title={t('teleport.title')}
        headerAction={<ModeInfoTooltip description={t('teleport.description')} />}
        notices={<>
          {!deviceId && <PanelNotice>{t('panel.hint.select_device')}</PanelNotice>}
          {deviceId && !deviceReady && <PanelNotice tone="warning">{device ? deviceStatusMessage(device, t) : t('panel.hint.device_not_ready')}</PanelNotice>}
          {isOtherModeActive && <PanelNotice tone="warning">{t('teleport.hint.navigating')}</PanelNotice>}
        </>}
        footer={
          <PanelFooter justify="flex-end">
            <Stack gap="xs" w="100%">
              {teleportMode === 'standard' && !isGoldDittoHolding && (
                <Group grow gap="xs">
                  <Button
                    color="red"
                    variant="light"
                    loading={status.kind === 'busy'}
                    disabled={!deviceReady || status.kind === 'busy'}
                    onClick={handleClear}
                  >
                    {t('teleport.action.clear')}
                  </Button>
                  {restoreAll && (
                    <Button
                      color="red"
                      variant="light"
                      loading={status.kind === 'busy'}
                      disabled={status.kind === 'busy'}
                      onClick={() => void handleClearAll()}
                    >
                      {t('teleport.action.clear_all')}
                    </Button>
                  )}
                </Group>
              )}
              <Group grow gap="xs">
                {teleportMode === 'gold' ? (
                  isGoldDittoHolding && !goldFinishing ? (
                    <Button color="red" variant="light" disabled={status.kind === 'busy'} onClick={handleGoldDittoCancel}>
                      {t('teleport.goldditto.action.cancel')}
                    </Button>
                  ) : (!goldFinishing && (
                    <Button variant="default" disabled={!target} onClick={handlePreview}>
                      {t('teleport.action.preview')}
                    </Button>
                  ))
                ) : (
                  <Button variant="default" disabled={!target || goldFinishing} onClick={handlePreview}>
                    {t('teleport.action.preview')}
                  </Button>
                )}
                <Button
                  disabled={isGoldDittoHolding ? !deviceReady || status.kind === 'busy' : !canAct || goldFinishing}
                  loading={status.kind === 'busy' && !goldFinishing}
                  onClick={isGoldDittoHolding
                    ? handleGoldDittoRestore
                    : (teleportMode === 'gold' ? handleGoldDittoStart : handleSet)}
                >
                  {goldFinishing
                    ? t('teleport.goldditto.action.finishing')
                    : isGoldDittoHolding
                    ? t('teleport.goldditto.action.restore')
                    : t(teleportMode === 'gold'
                      ? (goldCompleted ? 'teleport.goldditto.action.again' : 'teleport.goldditto.action.start')
                      : 'teleport.action.set_location')}
                </Button>
              </Group>
            </Stack>
          </PanelFooter>
        }
      >
        <PanelSection>
          <SegmentedControl
            fullWidth
            size="xs"
            value={teleportMode}
            disabled={isGoldDittoHolding || goldFinishing}
            onChange={handleTeleportModeChange}
            data={[
              { value: 'standard', label: t('teleport.mode.standard') },
              { value: 'gold', label: t('teleport.goldditto.title') },
            ]}
          />
        </PanelSection>
        {teleportMode === 'gold' && (
          <GoldDittoGuide
            phase={goldPhase}
            countdown={goldCountdown}
            setupControls={(
              <div className="gold-guide__form">
                <div className="gold-guide__field">
                  <Text size="xs" fw={600}>{t('teleport.goldditto.target_label')}</Text>
                  <CoordinateField
                    placeholder="lat, lng or Google Maps URL"
                    value={targetText}
                    onFocus={handleFocusInput}
                    onChange={handleTextChange}
                    onBlur={handleInputBlur}
                    rightSection={<FavoriteButton point={target} />}
                  />
                  <Group gap="xs">
                    <Button size="compact-sm" variant="default" onClick={handlePasteClipboard}>{t('teleport.action.paste')}</Button>
                    {livePosition && <Button size="compact-sm" variant="default" onClick={handleUseCurrentLocation}>{t('teleport.action.my_location')}</Button>}
                  </Group>
                  {distanceKm !== null && <Text size="xs" c="dimmed">{t('teleport.distance')}: {distanceKm.toFixed(1)} km · {t('teleport.cooldown')}: ~{cooldownMinutes} min</Text>}
                </div>
                <div className="gold-guide__field">
                  <Text size="xs" fw={600}>{t('teleport.goldditto.origin_label')}</Text>
                  <CoordinateField
                    placeholder={t('teleport.goldditto.origin_placeholder')}
                    value={goldOriginText}
                    onFocus={handlePickGoldOrigin}
                    onChange={handleGoldOriginTextChange}
                    onBlur={handleGoldOriginBlur}
                  />
                  {livePosition && (
                    <Group gap="xs">
                      <Button size="compact-sm" variant="default" onClick={handleUseCurrentAsGoldOrigin}>{t('teleport.action.my_location')}</Button>
                    </Group>
                  )}
                  <span className="gold-guide__field-help">{t('teleport.goldditto.origin_help')}</span>
                </div>
              </div>
            )}
          />
        )}
        {teleportMode === 'standard' && (
          <PanelSection>
            <CoordinateField
              placeholder="lat, lng or Google Maps URL"
              value={targetText}
              onFocus={handleFocusInput}
              onChange={handleTextChange}
              onBlur={handleInputBlur}
              rightSection={<FavoriteButton point={target} />}
            />
            <Group gap="xs">
              <Button size="compact-sm" variant="default" onClick={handlePasteClipboard}>{t('teleport.action.paste')}</Button>
              {livePosition && <Button size="compact-sm" variant="default" onClick={handleUseCurrentLocation}>{t('teleport.action.my_location')}</Button>}
            </Group>
            {distanceKm !== null && <Text size="xs" c="dimmed">{t('teleport.distance')}: {distanceKm.toFixed(1)} km · {t('teleport.cooldown')}: ~{cooldownMinutes} min</Text>}
          </PanelSection>
        )}
      </ModePanelLayout>

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
