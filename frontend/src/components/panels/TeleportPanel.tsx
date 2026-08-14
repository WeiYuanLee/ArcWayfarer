import { useEffect, useState } from 'react'
import { Accordion, Button, Group } from '@mantine/core'
import { clearLocation, goldDitto, pushHistory, setLocation } from '../../services/api'
import type { LatLng, PanelProps } from './types'
import { EMPTY_OVERLAY } from './types'
import { formatPoint, parsePoint } from './coords'
import { FavoriteButton } from './FavoriteButton'
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu'
import { ModeInfoTooltip } from '../common/ModeInfoTooltip'
import { showToast } from '../common/Toast'
import { useT } from '../../i18n'
import { CoordinateField, ModePanelLayout, PanelFooter, PanelNotice, PanelSection, PanelStatus } from './ui'

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
      <ModePanelLayout
        title={t('teleport.title')}
        headerAction={<ModeInfoTooltip description={t('teleport.description')} />}
        notices={<>
          {!deviceId && <PanelNotice>{t('panel.hint.select_device')}</PanelNotice>}
          {deviceId && !deviceReady && <PanelNotice tone="warning">{device?.detail ?? t('panel.hint.device_not_ready')}</PanelNotice>}
          {isOtherModeActive && <PanelNotice tone="warning">{t('teleport.hint.navigating')}</PanelNotice>}
        </>}
        footer={
          <PanelFooter>
            <Button color="red" variant="light" disabled={!deviceReady || status.kind === 'busy'} onClick={handleClear}>
              {t('teleport.action.clear')}
            </Button>
            <Group gap="xs">
              <Button variant="default" disabled={!target} onClick={handlePreview}>{t('teleport.action.preview')}</Button>
              <Button disabled={!canAct} loading={status.kind === 'busy'} onClick={handleSet}>{t('teleport.action.set_location')}</Button>
            </Group>
          </PanelFooter>
        }
        status={status.kind === 'idle' ? undefined : <PanelStatus state={status.kind} message={status.kind === 'busy' ? t('generic.working') : status.message} />}
      >
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
        </PanelSection>

        <PanelSection>
          <Accordion variant="contained" radius="sm">
            <Accordion.Item value="gold-ditto">
              <Accordion.Control>{t('teleport.goldditto.title')}</Accordion.Control>
              <Accordion.Panel>
                <PanelNotice tone="info">{t('teleport.goldditto.help')}</PanelNotice>
                <Button mt="sm" color="yellow" variant="light" disabled={!canAct} onClick={handleGoldDitto}>{t('teleport.goldditto.action')}</Button>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </PanelSection>
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
