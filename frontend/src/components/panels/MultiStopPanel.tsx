import { useEffect, useRef, useState } from 'react'
import { ActionIcon, Badge, Button, FileButton, Group, NumberInput, SegmentedControl, Stack } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react'
import { parseGpx } from './gpx'
import {
  pauseMultiStop,
  pushHistory,
  resumeMultiStop,
  setLocation,
  startMultiStop,
  startFlower,
  skipFlower,
  stopMultiStop,
  type NavMode,
} from '../../services/api'
import type { LatLng, MapOverlay, OverlayCircle, OverlayLink, PanelProps } from './types'
import { EMPTY_OVERLAY } from './types'
import { formatPoint, parsePastedPoints, parsePoint, routeLegForStop } from './coords'
import { SpeedSlider } from './SpeedSlider'
import { PlaybackControls } from './PlaybackControls'
import { ActiveFlightHUD } from './ActiveFlightHUD'
import { FlowerFlightHUD } from './FlowerFlightHUD'
import { FruitOffsetGeneratorModal } from './FruitOffsetGeneratorModal'
import { SwitchBar } from '../common/SwitchBar'
import { ModeInfoTooltip } from '../common/ModeInfoTooltip'
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu'
import { ConfirmModal } from '../common/ConfirmModal'
import { PasteCoordinatesModal } from '../common/PasteCoordinatesModal'
import { showToast } from '../common/Toast'
import { useT } from '../../i18n'

import { useWaypointList } from '../../hooks/useWaypointList'
import {
  CoordinateField,
  ModePanelLayout,
  NumberRangeField,
  PanelFooter,
  PanelNotice,
  PanelSection,
  PanelStatus,
} from './ui'

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string }
type ImportMessage = { kind: 'ok' | 'error'; text: string }

const WAYPOINT_COLOR = '#4a9af0'

function flowerPreviewRadii(
  radius: number,
  circles: number,
  strategy: 'center_spiral' | 'perimeter',
): number[] {
  if (strategy === 'perimeter') return [radius]
  const ringCount = Math.max(1, Math.ceil(circles))
  const inner = Math.min(radius, Math.max(5, Math.max(12, radius * 0.6)))
  if (ringCount === 1) return [radius]
  return Array.from({ length: ringCount }, (_, index) =>
    radius - (index * (radius - inner)) / (ringCount - 1),
  )
}

/** Legacy Multi-stop map contract. Keep this independent from Flower visuals. */
function buildBasicMultiStopOverlay(routePath: LatLng[], activePath: LatLng[] | null): Pick<MapOverlay, 'path' | 'activePath' | 'circles' | 'links'> {
  return { path: routePath, activePath, circles: [], links: [] }
}

type FlowerOverlayInput = {
  waypoints: LatLng[]
  radius: number
  circles: number
  strategy: 'center_spiral' | 'perimeter'
  routeType: 'stop_at_end' | 'return_to_start' | 'loop_forever'
  isActive: boolean
  progress: PanelProps['flowerProgress']
}

/** Flower-only map contract: zones and transfers, never the legacy route path. */
function buildFlowerOverlay({ waypoints, radius, circles, strategy, routeType, isActive, progress }: FlowerOverlayInput): Pick<MapOverlay, 'path' | 'activePath' | 'circles' | 'links'> {
  const currentFlower = progress?.flowerIndex ?? 1
  const flowerCircles: OverlayCircle[] = waypoints.flatMap((point, flowerIndex) =>
    flowerPreviewRadii(radius, circles, strategy).map((ringRadius, ringIndex) => ({
      id: `flower-${flowerIndex}-ring-${ringIndex}`,
      lat: point.lat,
      lng: point.lng,
      radiusMeters: ringRadius,
      color: currentFlower === flowerIndex + 1 ? '#d6336c' : '#f06292',
      fillColor: '#f06292',
      fillOpacity: ringIndex === 0 && currentFlower === flowerIndex + 1 ? 0.14 : ringIndex === 0 ? 0.07 : 0.025,
      weight: currentFlower === flowerIndex + 1 && ringIndex === 0 ? 3 : 1.5,
      dashArray: '5 5',
    })),
  )
  const transfers: OverlayLink[] = waypoints.slice(0, -1).map((from, index) => {
    const activeLegIndex = progress?.phase === 'approach' && currentFlower > 1 ? currentFlower - 2 : -1
    const isCurrentLeg = isActive && index === activeLegIndex
    return {
      id: `flower-travel-${index}`,
      from,
      to: waypoints[index + 1],
      color: isCurrentLeg ? '#d6336c' : '#7185aa',
      opacity: isCurrentLeg ? 0.95 : 0.82,
      weight: isCurrentLeg ? 2.5 : 1.5,
      dashArray: isCurrentLeg ? '8 6' : '3 7',
    }
  })
  if (routeType !== 'stop_at_end' && waypoints.length > 1) {
    transfers.push({
      id: 'flower-travel-return', from: waypoints[waypoints.length - 1], to: waypoints[0],
      color: '#7185aa', opacity: 0.82, weight: 1.5, dashArray: '3 7',
    })
  }
  return { path: [], activePath: null, circles: flowerCircles, links: transfers }
}

export function MultiStopPanel({
  deviceId,
  device,
  deviceState,
  livePosition,
  liveSpeedMps,
  liveEtaSeconds,
  liveStopIndex,
  flowerProgress,
  connected,
  requestPoint,
  cancelPointRequest,
  requestFlyTo,
  setOverlay,
}: PanelProps) {
  const t = useT()
  const {
    items,
    validWaypoints,
    updateWaypoint,
    handleTextChange,
    addWaypoint,
    insertWaypointAfter,
    removeWaypoint,
    moveWaypoint,
    clearAllWaypoints,
    setAllWaypoints,
  } = useWaypointList(2)
  const [navMode, setNavMode] = useState<NavMode>('walk')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [routePath, setRoutePath] = useState<LatLng[]>([])
  const [routeLegs, setRouteLegs] = useState<LatLng[][]>([])
  const [pauseEnabled, setPauseEnabled] = useState(false)
  const [pauseMin, setPauseMin] = useState(5)
  const [pauseMax, setPauseMax] = useState(20)
  const [straightLine, setStraightLine] = useState(true)
  const [speedKmh, setSpeedKmh] = useState(5)
  const [jumpMode, setJumpMode] = useState(false)
  const [jumpPreDelay, setJumpPreDelay] = useState(0)
  const [jumpPostDelay, setJumpPostDelay] = useState(2)
  const [subtab, setSubtab] = useState<'multi' | 'flower'>('multi')
  const [flowerRadius, setFlowerRadius] = useState(30)
  const [flowerCircles, setFlowerCircles] = useState(1)
  const [flowerSegments, setFlowerSegments] = useState(16)
  const [flowerPathStrategy, setFlowerPathStrategy] = useState<'center_spiral' | 'perimeter'>('center_spiral')
  const [flowerPreWait, setFlowerPreWait] = useState(0)
  const [flowerPostWait, setFlowerPostWait] = useState(2)
  const [flowerRouteType, setFlowerRouteType] = useState<'stop_at_end' | 'return_to_start' | 'loop_forever'>('stop_at_end')
  const [flowerRounds, setFlowerRounds] = useState(1)
  const [fruitOffsetOpen, setFruitOffsetOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [importMessage, setImportMessage] = useState<ImportMessage | null>(null)
  const [gpxFileName, setGpxFileName] = useState<string | null>(null)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    description: string
    onConfirm: () => void
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
  })
  const lastWaypointRef = useRef<HTMLDivElement | null>(null)
  const focusNewWaypointRef = useRef(false)

  const deviceReady = device?.status === 'ready'
  const isRunning = deviceState === 'navigating'
  const isPaused = deviceState === 'paused' || deviceState === 'paused:navigating'
  const isActive = isRunning || isPaused
  const isBusy = status.kind === 'busy'
  const isFlower = subtab === 'flower'
  const canStart = deviceReady && !isActive && validWaypoints.length >= (isFlower ? 1 : 2) && !isBusy

  // Auto fill waypoint 1 with live position if empty
  useEffect(() => {
    if (!items[0]?.point && livePosition && !items[0]?.rawText) {
      updateWaypoint(0, livePosition)
    }
  }, [livePosition, items, updateWaypoint])

  // Automatically update route path preview when not active
  useEffect(() => {
    if (!isActive) {
      if (validWaypoints.length >= 2) {
        setRoutePath(validWaypoints)
      } else {
        setRoutePath([])
      }
    }
  }, [validWaypoints, isActive])

  const isLocked = isActive || isBusy
  const activePath = isRunning && validWaypoints.length >= 2
    ? routeLegs[(liveStopIndex ?? 1) - 1] ?? routeLegForStop(routePath, validWaypoints, liveStopIndex ?? 1, false)
    : null

  useEffect(() => {
    if (!focusNewWaypointRef.current) return
    focusNewWaypointRef.current = false
    requestAnimationFrame(() => {
      lastWaypointRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      const input = lastWaypointRef.current?.querySelector('input')
      if (input) {
        input.focus()
      }
    })
  }, [items.length])

  function handleAddWaypoint() {
    focusNewWaypointRef.current = true
    addWaypoint()
  }

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    title?: string
    items: ContextMenuItem[]
  } | null>(null)

  // Clean up overlay on unmount only
  useEffect(() => {
    return () => setOverlay(EMPTY_OVERLAY)
  }, [setOverlay])

  useEffect(() => {
    setOverlay({
      markers: [
        ...items
        .map((item, idx) =>
          item.point
            ? {
                id: `multistop-${idx}`,
                lat: item.point.lat,
                lng: item.point.lng,
                color: isFlower ? '#f06292' : WAYPOINT_COLOR,
                label: String(idx + 1),
                title: `Stop #${idx + 1} (${item.point.lat.toFixed(5)}, ${item.point.lng.toFixed(5)})`,
                draggable: !isLocked,
                pathIndex: idx,
                onDragEnd: (lat: number, lng: number) => {
                  if (isLocked) return
                  updateWaypoint(idx, { lat, lng })
                },
                onContextMenu: ({ clientX, clientY }: { clientX: number; clientY: number }) => {
                  setContextMenu({
                    x: clientX,
                    y: clientY,
                    title: `Stop #${idx + 1}`,
                    items: [
                      {
                        id: 'teleport',
                        label: t('contextmenu.teleport'),
                        disabled: deviceState !== 'idle' || !deviceId,
                        onClick: async () => {
                          if (!deviceId || !item.point) return
                          try {
                            await setLocation(deviceId, item.point.lat, item.point.lng)
                          } catch (e) {
                            setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Teleport failed' })
                          }
                        },
                      },
                      {
                        id: 'copy-coords',
                        label: t('contextmenu.copy_coords'),
                        onClick: () => {
                          if (!item.point) return
                          navigator.clipboard.writeText(`${item.point.lat.toFixed(6)}, ${item.point.lng.toFixed(6)}`)
                          showToast(t('toast.copied_coords'))
                        },
                      },
                      {
                        id: 'delete',
                        label: t('contextmenu.delete_waypoint'),
                        danger: true,
                        disabled: isLocked || items.length <= 2,
                        onClick: () => removeWaypoint(idx),
                      },
                    ],
                  })
                },
              }
            : null
        )
        .filter((m): m is NonNullable<typeof m> => m !== null),
      ],
      ...(isFlower
        ? buildFlowerOverlay({
            waypoints: validWaypoints,
            radius: flowerRadius,
            circles: flowerCircles,
            strategy: flowerPathStrategy,
            routeType: flowerRouteType,
            isActive,
            progress: flowerProgress,
          })
        : buildBasicMultiStopOverlay(routePath, activePath)),
      onPathClick: (lat, lng) => {
        if (isLocked) return
        addWaypoint({ lat, lng })
      },
      onMapContextMenu: ({ lat, lng, clientX, clientY }) => {
        setContextMenu({
          x: clientX,
          y: clientY,
          title: `地圖位置 (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          items: [
            {
              id: 'add-wp-here',
              label: t('contextmenu.add_wp_here'),
              disabled: isLocked,
              onClick: () => addWaypoint({ lat, lng }),
            },
            {
              id: 'teleport-here',
              label: t('contextmenu.teleport_here'),
              disabled: deviceState !== 'idle' || !deviceId,
              onClick: async () => {
                if (!deviceId) return
                try {
                  await setLocation(deviceId, lat, lng)
                } catch (e) {
                  setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Teleport failed' })
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
  }, [items, routePath, activePath, isLocked, deviceState, deviceId, setOverlay, updateWaypoint, removeWaypoint, addWaypoint, t, isFlower, isActive, validWaypoints, flowerRadius, flowerCircles, flowerPathStrategy, flowerRouteType, flowerProgress])

  function handleClearAllWaypoints() {
    setConfirmModal({
      isOpen: true,
      title: t('confirm.clear_all_title'),
      description: t('confirm.clear_all_desc'),
      onConfirm: () => {
        clearAllWaypoints()
        setGpxFileName(null)
        setImportMessage(null)
      },
    })
  }

  async function processUnifiedImportFile(file: File) {
    setImportMessage(null)
    const isJson = file.name.toLowerCase().endsWith('.json')
    try {
      const text = await file.text()
      if (isJson) {
        try {
          const data = JSON.parse(text)
          if (Array.isArray(data.waypoints) && data.waypoints.length > 0) {
            setAllWaypoints(data.waypoints)
            if (typeof data.speedKmh === 'number') setSpeedKmh(data.speedKmh)
            if (data.navMode) setNavMode(data.navMode)
            if (typeof data.straightLine === 'boolean') setStraightLine(data.straightLine)
            if (typeof data.jumpMode === 'boolean') setJumpMode(data.jumpMode)
            if (typeof data.jumpPreDelay === 'number') setJumpPreDelay(data.jumpPreDelay)
            if (typeof data.jumpPostDelay === 'number') setJumpPostDelay(data.jumpPostDelay)
            if (typeof data.pauseEnabled === 'boolean') setPauseEnabled(data.pauseEnabled)
            if (typeof data.pauseMin === 'number') setPauseMin(data.pauseMin)
            if (typeof data.pauseMax === 'number') setPauseMax(data.pauseMax)
            requestFlyTo(data.waypoints[0].lat, data.waypoints[0].lng)
            setImportMessage({ kind: 'ok', text: t('multistop.import_template_success') })
            return
          }
        } catch {
          // fall through to GPX parsing
        }
      }

      // Try GPX parsing
      const points = parseGpx(text)
      if (points.length > 0) {
        setAllWaypoints(points)
        setGpxFileName(file.name)
        requestFlyTo(points[0].lat, points[0].lng)
        setImportMessage({ kind: 'ok', text: t('multistop.import_gpx_success') })
        return
      }

      setImportMessage({ kind: 'error', text: t('multistop.import_unrecognized_file') })
    } catch {
      setImportMessage({ kind: 'error', text: t('multistop.import_file_failed') })
    }
  }

  async function handleUnifiedImportFile(file: File) {
    if (validWaypoints.length > 0) {
      setConfirmModal({
        isOpen: true,
        title: t('confirm.gpx_overwrite_title'),
        description: t('confirm.gpx_overwrite_desc'),
        onConfirm: () => processUnifiedImportFile(file),
      })
    } else {
      processUnifiedImportFile(file)
    }
  }

  function processPasteSubmit() {
    const { points, invalidCount } = parsePastedPoints(pasteText)
    if (points.length === 0) {
      setImportMessage({ kind: 'error', text: t('multistop.paste_empty') })
      return
    }
    setAllWaypoints(points)
    requestFlyTo(points[0].lat, points[0].lng)
    setImportMessage(invalidCount > 0 ? { kind: 'ok', text: t('multistop.import_partial') } : null)
    setPasteOpen(false)
    setPasteText('')
  }

  function handlePasteSubmit() {
    if (validWaypoints.length > 0) {
      setConfirmModal({
        isOpen: true,
        title: t('confirm.paste_overwrite_title'),
        description: t('confirm.paste_overwrite_desc'),
        onConfirm: () => processPasteSubmit(),
      })
    } else {
      processPasteSubmit()
    }
  }

  function handleExportTemplate() {
    if (validWaypoints.length === 0) return
    const template = {
      version: '1.0',
      kind: 'multi_stop',
      name: `MultiStop_Route_${new Date().toISOString().slice(0, 10)}`,
      speedKmh,
      navMode,
      straightLine,
      jumpMode,
      jumpPreDelay,
      jumpPostDelay,
      pauseEnabled,
      pauseMin,
      pauseMax,
      waypoints: validWaypoints,
    }
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `multistop-route-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleStart() {
    if (!deviceId || validWaypoints.length < (isFlower ? 1 : 2)) return
    // The last coordinate field remains focused after typing.  Starting a
    // route must disarm its pending map pick before the user changes device.
    cancelPointRequest?.()
    setStatus({ kind: 'busy' })
    try {
      if (isFlower) {
        const flower: import('../../services/api').FlowerOptions = {
          radius_m: flowerRadius,
          circles: flowerCircles,
          segments: flowerSegments,
          path_strategy: flowerPathStrategy,
          inner_radius_m: null,
          jitter_m: 1.5,
          pre_wait_seconds: flowerPreWait,
          post_wait_seconds: flowerPostWait,
          route_type: flowerRouteType,
          rounds: flowerRouteType === 'return_to_start' ? flowerRounds : flowerRouteType === 'loop_forever' ? 'infinite' : 1,
        }
        const result = await startFlower(deviceId, navMode, validWaypoints, flower, { straightLine, jumpMode, customSpeedKmh: speedKmh })
        setRoutePath([])
        setRouteLegs(result.legs)
        pushHistory({ lat: validWaypoints[0].lat, lng: validWaypoints[0].lng, kind: 'multi_stop' }).catch(() => {})
        setStatus({ kind: 'idle' })
        return
      }
      const result = await startMultiStop(
        deviceId,
        navMode,
        validWaypoints,
        { enabled: pauseEnabled, min: pauseMin, max: pauseMax },
        { straightLine, jumpMode, jumpPreDelay, jumpPostDelay, customSpeedKmh: speedKmh }
      )
      setRoutePath(result.route)
      setRouteLegs(result.legs)
      pushHistory({ lat: validWaypoints[0].lat, lng: validWaypoints[0].lng, kind: 'multi_stop' }).catch(() => {})
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('multistop.status.failed_start') })
    }
  }

  async function handleStop() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      await stopMultiStop(deviceId)
      setRoutePath([])
      setRouteLegs([])
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('multistop.status.failed_stop') })
    }
  }

  async function handlePauseResume() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      if (isPaused) {
        await resumeMultiStop(deviceId)
      } else {
        await pauseMultiStop(deviceId)
      }
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('multistop.status.failed_update') })
    }
  }

  async function handleSkipFlower() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      await skipFlower(deviceId)
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : '跳過此花失敗。' })
    }
  }

  const notices = (
    <>
      {!deviceId && <PanelNotice tone="info">{t('panel.hint.select_device')}</PanelNotice>}
      {deviceId && !deviceReady && (
        <PanelNotice tone="warning">{device?.detail ?? t('panel.hint.device_not_ready')}</PanelNotice>
      )}
      {deviceState === 'teleporting' && <PanelNotice tone="warning">{t('panel.hint.teleporting')}</PanelNotice>}
    </>
  )

  const statusMessage = status.kind === 'busy'
    ? <PanelStatus state="busy" message={t('generic.working')} />
    : status.kind === 'error' ? <PanelStatus state="error" message={status.message} /> : undefined

  return (
    <div className={`panel${isActive ? ' multistop-panel--active' : ''}${isFlower && !isActive ? ' multistop-panel--flower-editor' : ''}`}>
      <ModePanelLayout
        title={isFlower ? '種花模式' : t('multistop.title')}
        titleStatus={isActive ? <Badge size="sm" variant="light" color={isPaused ? 'yellow' : 'green'}>{isPaused ? t('panel.paused') : t('generic.working')}</Badge> : undefined}
        headerAction={<ModeInfoTooltip description={t('multistop.description')} />}
        alwaysShowScrollbar={isFlower && !isActive}
        constrainBody={isFlower && !isActive}
        notices={!isActive ? notices : undefined}
        footer={!isActive ? (
          <PanelFooter>
            <PlaybackControls
              canStart={canStart}
              isActive={isActive}
              isPaused={isPaused}
              isBusy={isBusy}
              onStart={handleStart}
              onPauseResume={handlePauseResume}
              onStop={handleStop}
            />
          </PanelFooter>
        ) : undefined}
        status={statusMessage}
      >
      {!isActive && (
        <SegmentedControl
          fullWidth
          size="xs"
          value={subtab}
          onChange={(value) => setSubtab(value as 'multi' | 'flower')}
          data={[
            { label: '基礎模式', value: 'multi' },
            { label: <span title="每個花點會自動建立 50m 進場點；後續輪次直接由最後一朵花前往第一朵花，不會重新走進場點。">種花模式</span>, value: 'flower' },
          ]}
        />
      )}
      {isActive ? (
        isFlower ? <FlowerFlightHUD
          progress={flowerProgress ?? null}
          isRunning={isRunning}
          isPaused={isPaused}
          isBusy={isBusy}
          connected={connected}
          onPauseResume={handlePauseResume}
          onSkip={handleSkipFlower}
          onStop={handleStop}
        /> : <ActiveFlightHUD
          isRunning={isRunning}
          isPaused={isPaused}
          isBusy={isBusy}
          currentIndex={liveStopIndex ?? 1}
          totalPoints={validWaypoints.length || 2}
          liveSpeedMps={liveSpeedMps ?? null}
          liveEtaSeconds={liveEtaSeconds}
          livePosition={livePosition}
          routePath={routePath}
          waypoints={items.map((i) => i.point)}
          isLoop={false}
          connected={connected}
          onPauseResume={handlePauseResume}
          onStop={handleStop}
        />
      ) : (
        <>
          <PanelSection>
            {gpxFileName && (
              <Group gap="xs" fz="xs" c="dimmed">
                <span>GPX: {gpxFileName}</span>
                <span>·</span>
                <span>{validWaypoints.length} Points</span>
              </Group>
            )}

            <Stack gap="xs" className="route-loop-waypoint-list">
              {items.map((item, idx) => (
                <Group className="route-loop-waypoint-row" key={item.id} wrap="nowrap" gap="xs" ref={idx === items.length - 1 ? lastWaypointRef : undefined}>
                    <Badge variant="light" color={isFlower ? 'pink' : 'gray'} circle>{idx + 1}</Badge>
                  <CoordinateField size="xs"
                    placeholder="lat, lng or URL"
                    value={item.rawText}
                    style={{ flex: 1 }}
                    onFocus={() => {
                      requestPoint((lat, lng) => updateWaypoint(idx, { lat, lng }))
                    }}
                    onChange={(value) => handleTextChange(idx, value)}
                  />
                  <Group gap={2} wrap="nowrap">
                    <ActionIcon variant="subtle" disabled={idx === 0} onClick={() => moveWaypoint(idx, 'up')} aria-label="Move Up"><IconArrowUp size={16} /></ActionIcon>
                    <ActionIcon variant="subtle" disabled={idx === items.length - 1} onClick={() => moveWaypoint(idx, 'down')} aria-label="Move Down"><IconArrowDown size={16} /></ActionIcon>
                    <ActionIcon color="red" variant="subtle"
                      disabled={isLocked || items.length <= (isFlower ? 1 : 2)}
                      onClick={() => removeWaypoint(idx)}
                      title={t('panel.remove_waypoint')}
                    aria-label={t('panel.remove_waypoint')}><IconTrash size={16} /></ActionIcon>
                  </Group>
                </Group>
              ))}
            </Stack>

            <Group grow gap="xs"><Button fullWidth size="compact-sm" variant="default" leftSection={<IconPlus size={14} />} onClick={handleAddWaypoint}>{t('panel.add_waypoint')}</Button><Button fullWidth size="compact-sm" color="red" variant="default" onClick={handleClearAllWaypoints}>{t('multistop.action.clear_all')}</Button></Group>
            <Group grow gap="xs">
            <FileButton accept=".gpx,.json,application/gpx+xml,application/json"
              onChange={async (file) => {
                if (file) await handleUnifiedImportFile(file)
              }}>
              {(props) => <Button {...props} fullWidth size="compact-sm" variant="default">{t('multistop.import_file')}</Button>}
            </FileButton>
            {/* native input retained only for browser file selection behavior */}
            {false && <input type="file"
                accept=".gpx,.json,application/gpx+xml,application/json"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) await handleUnifiedImportFile(file)
                  e.target.value = ''
                }}
              />}
            <Button fullWidth size="compact-sm" variant="default" onClick={handleExportTemplate} disabled={validWaypoints.length === 0}>{t('multistop.export_template')}</Button>
            <Button fullWidth size="compact-sm" variant="default" onClick={() => setPasteOpen(true)}>{t('multistop.paste_coords')}</Button>
            </Group>

            {importMessage && <PanelStatus state={importMessage.kind === 'error' ? 'error' : 'success'} message={importMessage.text} />}
            {isFlower && <Button fullWidth size="compact-sm" variant="default" onClick={() => setFruitOffsetOpen(true)} disabled={!validWaypoints.length}>產生建議領果座標</Button>}
          </PanelSection>

          <PanelSection title={t('multistop.section.operation_mode')}>
            <SegmentedControl fullWidth size="xs" disabled={isActive} value={jumpMode ? 'jump' : 'line'} onChange={(value) => { setJumpMode(value === 'jump'); if (value === 'line') setStraightLine(true) }} data={[{ label: t('multistop.jump_mode'), value: 'jump' }, { label: t('multistop.straight_line'), value: 'line' }]} />

            {jumpMode && !isFlower ? (
            <>
              <NumberInput label={t('multistop.jump_pre_delay')}
                  min={0}
                  value={jumpPreDelay}
                  disabled={isActive}
                  onFocus={(e) => e.target.select()}
                  onChange={(value) => setJumpPreDelay(Number(value) || 0)} />
              <NumberInput label={t('multistop.jump_post_delay')}
                  min={0}
                  value={jumpPostDelay}
                  disabled={isActive}
                  onFocus={(e) => e.target.select()}
                  onChange={(value) => setJumpPostDelay(Number(value) || 0)} />
            </>
            ) : !isFlower ? (
            <>
              <SwitchBar
                label={t('panel.pause_toggle')}
                subLabel={pauseEnabled ? t('panel.pause_summary') : undefined}
                checked={pauseEnabled}
                onChange={setPauseEnabled}
                disabled={isActive}
              >
                {pauseEnabled && <NumberRangeField
                  min={pauseMin}
                  max={pauseMax}
                  minLabel={t('panel.pause_min')}
                  maxLabel={t('panel.pause_max')}
                  onMinChange={(value) => setPauseMin(Number(value) || 0)}
                  onMaxChange={(value) => setPauseMax(Number(value) || 0)}
                  minProps={{ min: 0, disabled: isActive, onFocus: (event) => event.target.select() }}
                  maxProps={{ min: 0, disabled: isActive, onFocus: (event) => event.target.select() }}
                />}
              </SwitchBar>
            </>
            ) : null}
          </PanelSection>

          {/* Flower circling always uses this speed, including when travel
              between flowers is set to instant jump. */}
          {(!jumpMode || isFlower) && (
            <PanelSection>
              <SpeedSlider
                valueKmh={speedKmh}
                navMode={navMode}
                onChange={setSpeedKmh}
                onNavModeChange={setNavMode}
                disabled={isActive}
              />
            </PanelSection>
          )}

          {isFlower && (
            <PanelSection title="種花設定">
              <SegmentedControl
                fullWidth
                size="xs"
                value={flowerPathStrategy}
                onChange={(value) => setFlowerPathStrategy(value as 'center_spiral' | 'perimeter')}
                data={[
                  { label: '穿心螺旋', value: 'center_spiral' },
                  { label: '圓周繞行', value: 'perimeter' },
                ]}
              />
              <NumberInput label="花朵半徑（公尺）" min={5} max={100} value={flowerRadius} onChange={(v) => setFlowerRadius(Number(v) || 5)} />
              <NumberInput label="繞圈數" min={0.5} step={0.5} max={10} value={flowerCircles} onChange={(v) => setFlowerCircles(Number(v) || 0.5)} />
              <NumberInput label="到達前等待（秒）" min={0} value={flowerPreWait} onChange={(v) => setFlowerPreWait(Number(v) || 0)} />
              <NumberInput label="完成後等待（秒）" min={0} value={flowerPostWait} onChange={(v) => setFlowerPostWait(Number(v) || 0)} />
              <SegmentedControl fullWidth size="xs" value={flowerRouteType} onChange={(v) => setFlowerRouteType(v as 'stop_at_end' | 'return_to_start' | 'loop_forever')} data={[{ label: '停在終點', value: 'stop_at_end' }, { label: '回到起點', value: 'return_to_start' }, { label: '持續循環', value: 'loop_forever' }]} />
              {flowerRouteType === 'return_to_start' && <NumberInput label="巡迴輪數" min={1} max={20} value={flowerRounds} onChange={(v) => setFlowerRounds(Number(v) || 1)} />}
            </PanelSection>
          )}
        </>
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

      <PasteCoordinatesModal
        isOpen={pasteOpen}
        value={pasteText}
        onChange={setPasteText}
        onSubmit={handlePasteSubmit}
        onClose={() => setPasteOpen(false)}
      />

      <FruitOffsetGeneratorModal
        opened={fruitOffsetOpen}
        onClose={() => setFruitOffsetOpen(false)}
        flowers={validWaypoints}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        description={confirmModal.description}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  )
}
