import { useEffect, useState } from 'react'
import { Button, TextInput } from '@mantine/core'
import { pauseNavigate, pushHistory, resumeNavigate, setLocation, startNavigate, stopNavigate, type NavMode } from '../../services/api'
import type { LatLng, PanelProps } from './types'
import { EMPTY_OVERLAY } from './types'
import { estimateDurationMinutes, formatEta, formatPoint, haversineDistanceKm, parsePoint } from './coords'
import { SpeedSlider } from './SpeedSlider'
import { PlaybackControls } from './PlaybackControls'
import { FavoriteButton } from './FavoriteButton'
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu'
import { ModeInfoTooltip } from '../common/ModeInfoTooltip'
import { showToast } from '../common/Toast'
import { useT } from '../../i18n'

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string }

export function NavigatePanel({ deviceId, device, deviceState, livePosition, liveEtaSeconds, requestPoint, setOverlay }: PanelProps) {
  const t = useT()
  const [start, setStart] = useState<LatLng | null>(null)
  const [end, setEnd] = useState<LatLng | null>(null)
  const [startText, setStartText] = useState('')
  const [endText, setEndText] = useState('')
  const [navMode, setNavMode] = useState<NavMode>('walk')
  const [speedKmh, setSpeedKmh] = useState(5)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [routePath, setRoutePath] = useState<LatLng[]>([])
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

  const canStart = deviceReady && !isActive && start !== null && end !== null && !isBusy

  const isLocked = isActive || isBusy

  useEffect(() => {
    setOverlay({
      markers: [
        ...(start ? [{ id: 'nav-start', lat: start.lat, lng: start.lng, color: '#4caf50', label: 'S', draggable: !isLocked, onDragEnd: (lat: number, lng: number) => { if (isLocked) return; setStart({ lat, lng }); setStartText(formatPoint({ lat, lng })) } }] : []),
        ...(end ? [{ id: 'nav-end', lat: end.lat, lng: end.lng, color: '#e05555', label: 'E', draggable: !isLocked, onDragEnd: (lat: number, lng: number) => { if (isLocked) return; setEnd({ lat, lng }); setEndText(formatPoint({ lat, lng })) } }] : []),
      ],
      path: routePath,
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
  }, [start, end, routePath, isLocked, deviceId, deviceState, setOverlay, t])

  async function handleStart() {
    if (!deviceId || !start || !end) return
    setStatus({ kind: 'busy' })
    try {
      const result = await startNavigate(deviceId, navMode, start, end, speedKmh)
      setRoutePath(result.route)
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
      setRoutePath([])
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
    setStartText(value)
    const parsed = parsePoint(value)
    if (parsed) setStart(parsed)
  }

  function handleEndTextChange(value: string) {
    setEndText(value)
    const parsed = parsePoint(value)
    if (parsed) setEnd(parsed)
  }

  function handleSwap() {
    const s = start
    setStart(end)
    setEnd(s)
    setStartText(formatPoint(end))
    setEndText(formatPoint(s))
  }

  const distanceKm = start && end ? haversineDistanceKm(start, end) : null
  const durationMin = distanceKm !== null ? estimateDurationMinutes(distanceKm, speedKmh) : null

  return (
    <div className="panel">
      <div className="panel-header-row">
        <h2>{t('navigate.title')}</h2>
        <ModeInfoTooltip description={t('navigate.description')} />
      </div>

      <div className="panel-scroll-body">
      {!deviceId && <p className="panel-hint">{t('panel.hint.select_device')}</p>}
      {deviceId && !deviceReady && (
        <p className="panel-hint warning">{device?.detail ?? t('panel.hint.device_not_ready')}</p>
      )}
      {deviceState === 'teleporting' && (
        <p className="panel-hint warning">{t('panel.hint.teleporting')}</p>
      )}

      {distanceKm !== null && (
        <div className="route-preflight-badge">
          <span>{t('navigate.distance')}: {distanceKm.toFixed(2)} km</span>
          <span>·</span>
          <span>{t('navigate.est_time')}: {durationMin} {t('navigate.minutes')}</span>
        </div>
      )}

      <div className="coord-row">
        <span>S</span>
        <TextInput
          placeholder="lat, lng or URL"
          value={startText}
          onFocus={() => requestPoint((lat, lng) => { setStart({ lat, lng }); setStartText(formatPoint({ lat, lng })) })}
          onChange={(event) => handleStartTextChange(event.currentTarget.value)}
          rightSection={<FavoriteButton point={start} />}
        />
      </div>
      <Button size="compact-sm" variant="default" onClick={handleSwap} title={t('navigate.swap')}>
        {t('navigate.swap')}
      </Button>
      <div className="coord-row">
        <span>E</span>
        <TextInput
          placeholder="lat, lng or URL"
          value={endText}
          onFocus={() => requestPoint((lat, lng) => { setEnd({ lat, lng }); setEndText(formatPoint({ lat, lng })) })}
          onChange={(event) => handleEndTextChange(event.currentTarget.value)}
          rightSection={<FavoriteButton point={end} />}
        />
      </div>

      <SpeedSlider
        valueKmh={speedKmh}
        navMode={navMode}
        onChange={setSpeedKmh}
        onNavModeChange={setNavMode}
        disabled={isActive}
      />
      </div>

      <PlaybackControls
        canStart={canStart}
        isActive={isActive}
        isPaused={isPaused}
        isBusy={isBusy}
        onStart={handleStart}
        onPauseResume={handlePauseResume}
        onStop={handleStop}
      />

      {status.kind === 'busy' && <p className="panel-status">{t('generic.working')}</p>}
      {isRunning && (
        <p className="panel-status ok">
          {t('navigate.status.running')}{liveEtaSeconds !== null ? `… ETA ${formatEta(liveEtaSeconds)}` : '…'}
        </p>
      )}
      {isPaused && <p className="panel-status warning">{t('panel.paused')}</p>}
      {status.kind === 'error' && <p className="panel-status error">{status.message}</p>}
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
