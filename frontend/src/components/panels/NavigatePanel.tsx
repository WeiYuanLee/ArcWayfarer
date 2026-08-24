import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Group, Paper, Stack, Text } from '@mantine/core'
import { pauseNavigate, previewNavigate, pushHistory, resumeNavigate, setLocation, startNavigate, stopNavigate, type NavMode } from '../../services/api'
import type { LatLng, PanelProps } from './types'
import { EMPTY_OVERLAY } from './types'
import { estimateDurationMinutes, formatEta, formatPoint, haversineDistanceKm, parsePoint } from './coords'
import { SpeedSlider } from './SpeedSlider'
import { PlaybackControls } from './PlaybackControls'
import { ActiveFlightHUD } from './ActiveFlightHUD'
import { FavoriteButton } from './FavoriteButton'
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu'
import { ModeInfoTooltip } from '../common/ModeInfoTooltip'
import { showToast } from '../common/Toast'
import { useT } from '../../i18n'
import { CoordinateField, ModePanelLayout, PanelFooter, PanelNotice, PanelSection, PanelStatus } from './ui'

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string }
type PreviewStatus = { kind: 'idle' | 'loading' | 'ready' | 'error' }

export function NavigatePanel({ deviceId, device, deviceState, livePosition, liveSpeedMps, liveEtaSeconds, liveStopIndex, connected, requestPoint, setOverlay }: PanelProps) {
  const t = useT()
  const [start, setStart] = useState<LatLng | null>(null)
  const [end, setEnd] = useState<LatLng | null>(null)
  const [startText, setStartText] = useState('')
  const [endText, setEndText] = useState('')
  const [navMode, setNavMode] = useState<NavMode>('walk')
  const [speedKmh, setSpeedKmh] = useState(5)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [routePath, setRoutePath] = useState<LatLng[]>([])
  const [routeDistanceMeters, setRouteDistanceMeters] = useState<number | null>(null)
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>({ kind: 'idle' })
  const [previewRevision, setPreviewRevision] = useState(0)
  const previewRequestIdRef = useRef(0)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; title?: string; items: ContextMenuItem[] } | null>(null)

  const deviceReady = device?.status === 'ready'
  const isRunning = deviceState === 'navigating'
  const isPaused = deviceState === 'paused'
  const isActive = isRunning || isPaused
  const isBusy = status.kind === 'busy'

  // Auto fill start point with live position if empty
  useEffect(() => {
    if (!start && livePosition && !startText) {
      setStart(livePosition)
      setStartText(formatPoint(livePosition))
    }
  }, [livePosition, start, startText])

  const canStart = deviceReady && !isActive && start !== null && end !== null && !isBusy && previewStatus.kind === 'ready' && routePath.length >= 2

  const isLocked = isActive || isBusy

  useEffect(() => {
    if (isActive) return

    previewRequestIdRef.current += 1
    const requestId = previewRequestIdRef.current
    if (!start || !end) {
      setRoutePath([])
      setRouteDistanceMeters(null)
      setPreviewStatus({ kind: 'idle' })
      return
    }

    const controller = new AbortController()
    setRoutePath([])
    setRouteDistanceMeters(null)
    setPreviewStatus({ kind: 'loading' })
    const timer = window.setTimeout(async () => {
      try {
        const result = await previewNavigate(navMode, start, end, controller.signal)
        if (requestId !== previewRequestIdRef.current || result.route.length < 2) return
        setRoutePath(result.route)
        setRouteDistanceMeters(result.distance_m)
        setPreviewStatus({ kind: 'ready' })
      } catch (error) {
        if (controller.signal.aborted || requestId !== previewRequestIdRef.current) return
        setRoutePath([])
        setRouteDistanceMeters(null)
        setPreviewStatus({ kind: 'error' })
      }
    }, 500)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [start?.lat, start?.lng, end?.lat, end?.lng, navMode, isActive, previewRevision])

  useEffect(() => {
    setOverlay({
      markers: [
        ...(start ? [{ id: 'nav-start', lat: start.lat, lng: start.lng, color: '#4caf50', label: 'S', draggable: !isLocked, onDragEnd: (lat: number, lng: number) => { if (isLocked) return; setStart({ lat, lng }); setStartText(formatPoint({ lat, lng })) } }] : []),
        ...(end ? [{ id: 'nav-end', lat: end.lat, lng: end.lng, color: '#e05555', label: 'E', draggable: !isLocked, onDragEnd: (lat: number, lng: number) => { if (isLocked) return; setEnd({ lat, lng }); setEndText(formatPoint({ lat, lng })) } }] : []),
      ],
      path: routePath,
      // Navigation has one planned leg, so the complete road geometry is also
      // the active path that receives the animated direction arrows.
      activePath: isRunning && routePath.length >= 2 ? routePath : null,
      onMapContextMenu: ({ lat, lng, clientX, clientY }) => {
        const clickedPoint = { lat, lng }
        setContextMenu({
          x: clientX,
          y: clientY,
          title: `地圖位置 (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          items: [
            { id: 'set-start', label: t('contextmenu.set_start'), disabled: isLocked, onClick: () => { setStart(clickedPoint); setStartText(formatPoint(clickedPoint)) } },
            { id: 'set-end', label: t('contextmenu.set_end'), disabled: isLocked, onClick: () => { setEnd(clickedPoint); setEndText(formatPoint(clickedPoint)) } },
            {
              id: 'teleport-here', label: t('contextmenu.teleport_here'), disabled: deviceState !== 'idle' || !deviceId,
              onClick: async () => {
                if (!deviceId) return
                try { await setLocation(deviceId, lat, lng) }
                catch (e) { setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('navigate.status.failed_start') }) }
              },
            },
            {
              id: 'copy-map-coords', label: t('contextmenu.copy_coords_short'),
              onClick: () => { navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`); showToast(t('toast.copied_coords')) },
            },
          ],
        })
      },
    })
    return () => setOverlay(EMPTY_OVERLAY)
  }, [start, end, routePath, isRunning, isLocked, deviceId, deviceState, setOverlay, t])

  async function handleStart() {
    if (!deviceId || !start || !end) return
    setStatus({ kind: 'busy' })
    try {
      const result = await startNavigate(deviceId, navMode, start, end, speedKmh)
      setRoutePath(result.route)
      setPreviewStatus({ kind: 'ready' })
      pushHistory({ lat: start.lat, lng: start.lng, kind: 'navigate' }).catch(() => {})
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('navigate.status.failed_start') })
    }
  }

  async function handleStop() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      await stopNavigate(deviceId)
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('navigate.status.failed_stop') })
    }
  }

  async function handlePauseResume() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      if (isPaused) {
        await resumeNavigate(deviceId)
      } else {
        await pauseNavigate(deviceId)
      }
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('navigate.status.failed_update') })
    }
  }

  function handleStartTextChange(value: string) {
    setStatus({ kind: 'idle' })
    setStartText(value)
    setStart(parsePoint(value))
  }

  function handleEndTextChange(value: string) {
    setStatus({ kind: 'idle' })
    setEndText(value)
    setEnd(parsePoint(value))
  }

  function handleSwap() {
    setStatus({ kind: 'idle' })
    const s = start
    setStart(end)
    setEnd(s)
    setStartText(formatPoint(end))
    setEndText(formatPoint(s))
  }

  function handleNavModeChange(value: NavMode) {
    setStatus({ kind: 'idle' })
    setNavMode(value)
  }

  const distanceKm = routeDistanceMeters !== null
    ? routeDistanceMeters / 1000
    : start && end ? haversineDistanceKm(start, end) : null
  const durationMin = distanceKm !== null ? estimateDurationMinutes(distanceKm, speedKmh) : null
  const notices = <>
    {!deviceId && <PanelNotice>{t('panel.hint.select_device')}</PanelNotice>}
    {deviceId && !deviceReady && <PanelNotice tone="warning">{device?.detail ?? t('panel.hint.device_not_ready')}</PanelNotice>}
    {deviceState === 'teleporting' && <PanelNotice tone="warning">{t('panel.hint.teleporting')}</PanelNotice>}
  </>

  return (
    <div className="panel">
      <ModePanelLayout
        title={t('navigate.title')}
        titleStatus={isActive ? <Badge size="sm" variant="light" color={isPaused ? 'yellow' : 'green'}>{isPaused ? t('panel.paused') : t('generic.working')}</Badge> : undefined}
        headerAction={<ModeInfoTooltip description={t('navigate.description')} />}
        notices={!isActive ? notices : undefined}
        footer={!isActive ? <PanelFooter><PlaybackControls canStart={canStart} isActive={isActive} isPaused={isPaused} isBusy={isBusy} onStart={handleStart} onPauseResume={handlePauseResume} onStop={handleStop} /></PanelFooter> : undefined}
        status={
          status.kind === 'busy' ? <PanelStatus state="busy" message={t('generic.working')} />
            : status.kind === 'error' ? <PanelStatus state="error" message={status.message} />
              : previewStatus.kind === 'loading' ? <PanelStatus state="busy" message={t('navigate.preview.planning')} />
                : previewStatus.kind === 'error' ? <Stack gap="xs">
                  <PanelStatus state="error" message={t('navigate.preview.failed')} />
                  <Button size="compact-sm" variant="default" onClick={() => setPreviewRevision((value) => value + 1)}>{t('navigate.preview.retry')}</Button>
                </Stack>
                  : undefined
        }
      >
        {isActive ? <ActiveFlightHUD isRunning={isRunning} isPaused={isPaused} isBusy={isBusy} currentIndex={liveStopIndex ?? 1} totalPoints={2} liveSpeedMps={liveSpeedMps ?? null} liveEtaSeconds={liveEtaSeconds} livePosition={livePosition} routePath={routePath} waypoints={[start, end]} legLabel={t('navigate.active_leg')} connected={connected} onPauseResume={handlePauseResume} onStop={handleStop} /> : <>
        {distanceKm !== null && (
          <Paper withBorder px="sm" py="xs" bg="var(--aw-surface-raised)">
            <Text size="xs" fw={600} mb={2}>{t('navigate.distance')}</Text>
            <Group gap="xs"><Text size="sm">{distanceKm.toFixed(2)} km</Text><Text c="dimmed">·</Text><Text size="sm">{t('navigate.est_time')}: {durationMin} {t('navigate.minutes')}</Text></Group>
          </Paper>
        )}
        <PanelSection>
          <CoordinateField
            label={t('navigate.start')}
            placeholder="lat, lng or URL"
            value={startText}
            onFocus={() => requestPoint((lat, lng) => { setStart({ lat, lng }); setStartText(formatPoint({ lat, lng })) })}
            onChange={handleStartTextChange}
            rightSection={<FavoriteButton point={start} />}
          />
          <Button size="compact-sm" variant="default" onClick={handleSwap}>{t('navigate.swap')}</Button>
          <CoordinateField
            label={t('navigate.destination')}
            placeholder="lat, lng or URL"
            value={endText}
            onFocus={() => requestPoint((lat, lng) => { setEnd({ lat, lng }); setEndText(formatPoint({ lat, lng })) })}
            onChange={handleEndTextChange}
            rightSection={<FavoriteButton point={end} />}
          />
        </PanelSection>
        <PanelSection>
          <SpeedSlider valueKmh={speedKmh} navMode={navMode} onChange={setSpeedKmh} onNavModeChange={handleNavModeChange} disabled={isActive} />
        </PanelSection>
        </>}
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
