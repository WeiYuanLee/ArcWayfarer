import { useEffect, useRef, useState } from 'react'
import { ActionIcon, Badge, Button, Group, NumberInput, SegmentedControl, Stack, Tooltip } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash, IconRefresh } from '@tabler/icons-react'
import { pauseRouteLoop, pushHistory, resumeRouteLoop, setLocation, startRouteLoop, stopRouteLoop, type NavMode } from '../../services/api'
import type { LatLng, PanelProps } from './types'
import { EMPTY_OVERLAY } from './types'
import { formatPoint, parsePoint, pointsOnCircle, routeLegForStop } from './coords'
import { SpeedSlider } from './SpeedSlider'
import { PlaybackControls } from './PlaybackControls'
import { ActiveFlightHUD } from './ActiveFlightHUD'
import { SwitchBar } from '../common/SwitchBar'
import { ModeInfoTooltip } from '../common/ModeInfoTooltip'
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu'
import { ConfirmModal } from '../common/ConfirmModal'
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
type SubMode = 'manual' | 'circle'

const WAYPOINT_COLOR = '#4a9af0'

export function RouteLoopPanel({ deviceId, device, deviceState, livePosition, liveStopIndex, liveEtaSeconds, connected, requestPoint, setOverlay }: PanelProps) {
  const t = useT()
  const [subMode, setSubMode] = useState<SubMode>('manual')
  const {
    items,
    validWaypoints,
    updateWaypoint,
    handleTextChange,
    addWaypoint,
    removeWaypoint,
    moveWaypoint,
    clearAllWaypoints,
    setAllWaypoints,
    reverseWaypoints,
    setAsStart,
  } = useWaypointList(2)
  
  // Circle sub-mode states
  const [circleCenter, setCircleCenter] = useState<LatLng | null>(null)
  const [circleCenterText, setCircleCenterText] = useState('')
  const [circleRadiusKm, setCircleRadiusKm] = useState(1)
  const [circleCount, setCircleCount] = useState(8)

  const [navMode, setNavMode] = useState<NavMode>('walk')
  const [speedKmh, setSpeedKmh] = useState(5)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [routePath, setRoutePath] = useState<LatLng[]>([])
  const [routeLegs, setRouteLegs] = useState<LatLng[][]>([])
  const [pauseEnabled, setPauseEnabled] = useState(false)
  const [pauseMin, setPauseMin] = useState(5)
  const [pauseMax, setPauseMax] = useState(20)
  const [straightLine, setStraightLine] = useState(true)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    title?: string
    items: ContextMenuItem[]
  } | null>(null)
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
  const suppressPointPickerRef = useRef(false)

  const deviceReady = device?.status === 'ready'
  const isRunning = deviceState === 'looping'
  const isPaused = deviceState === 'paused:looping'
  const isActive = isRunning || isPaused
  const isBusy = status.kind === 'busy'
  const canStart = deviceReady && !isActive && validWaypoints.length >= 2 && !isBusy

  const effectivePath = isActive
    ? (routePath.length >= 2 ? routePath : (validWaypoints.length >= 2 ? [...validWaypoints, validWaypoints[0]] : []))
    : (validWaypoints.length >= 2 ? [...validWaypoints, validWaypoints[0]] : [])

  const isLocked = isActive || isBusy
  const activePath = isRunning && validWaypoints.length >= 2
    ? routeLegs[(liveStopIndex ?? 1) - 1] ?? routeLegForStop(routePath, validWaypoints, liveStopIndex ?? 1, true)
    : null

  useEffect(() => {
    if (!focusNewWaypointRef.current) return
    focusNewWaypointRef.current = false
    requestAnimationFrame(() => {
      lastWaypointRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      const input = lastWaypointRef.current?.querySelector('input')
      if (input) {
        suppressPointPickerRef.current = true
        input.focus()
      }
    })
  }, [items.length])

  function handleAddWaypoint() {
    focusNewWaypointRef.current = true
    addWaypoint()
  }

  function handleClearAllWaypoints() {
    setConfirmModal({
      isOpen: true,
      title: t('confirm.clear_all_title'),
      description: t('confirm.clear_all_desc'),
      onConfirm: clearAllWaypoints,
    })
  }

  // Clean up overlay on unmount only
  useEffect(() => {
    return () => setOverlay(EMPTY_OVERLAY)
  }, [setOverlay])

  // Auto fill circle center with live position if empty
  useEffect(() => {
    if (!circleCenter && livePosition && !circleCenterText) {
      setCircleCenter(livePosition)
      setCircleCenterText(formatPoint(livePosition))
    }
  }, [livePosition, circleCenter, circleCenterText])

  // Recalculate circle waypoints when circle options change in circle mode
  useEffect(() => {
    if (subMode === 'circle' && circleCenter) {
      const radiusM = Math.max(0, circleRadiusKm * 1000)
      const count = Math.max(4, Math.min(36, circleCount || 8))
      const generated = pointsOnCircle(circleCenter, radiusM, count)
      setAllWaypoints(generated)
    }
  }, [subMode, circleCenter, circleRadiusKm, circleCount, setAllWaypoints])

  useEffect(() => {
    setOverlay({
      markers: items
        .map((item, idx) =>
          item.point
            ? {
                id: `loop-${idx}`,
                lat: item.point.lat,
                lng: item.point.lng,
                color: WAYPOINT_COLOR,
                label: String(idx + 1),
                title: `Stop #${idx + 1} (${item.point.lat.toFixed(5)}, ${item.point.lng.toFixed(5)})`,
                draggable: !isLocked && subMode === 'manual',
                pathIndex: idx,
                onDragEnd: (lat: number, lng: number) => {
                  if (isLocked || subMode === 'circle') return
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
                        id: 'set-start',
                        label: t('contextmenu.set_start'),
                        disabled: isLocked || idx === 0,
                        onClick: () => setAsStart(idx),
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
                        disabled: isLocked || items.length <= 2 || subMode === 'circle',
                        onClick: () => removeWaypoint(idx),
                      },
                    ],
                  })
                },
              }
            : null
        )
        .filter((m): m is NonNullable<typeof m> => m !== null),
      path: effectivePath,
      activePath,
      circle: subMode === 'circle' && circleCenter && circleRadiusKm > 0
        ? { lat: circleCenter.lat, lng: circleCenter.lng, radiusMeters: circleRadiusKm * 1000 }
        : null,
      onPathClick: (lat, lng) => {
        if (isLocked || subMode === 'circle') return
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
              disabled: isLocked || subMode === 'circle',
              onClick: () => addWaypoint({ lat, lng }),
            },
            {
              id: 'select-circle-center',
              label: t('contextmenu.select_circle_center'),
              disabled: isLocked,
              onClick: () => {
                const pt = { lat, lng }
                setCircleCenter(pt)
                setCircleCenterText(formatPoint(pt))
                if (subMode !== 'circle') {
                  setSubMode('circle')
                }
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
  }, [items, effectivePath, activePath, isLocked, deviceState, deviceId, setOverlay, subMode, circleCenter, circleRadiusKm, updateWaypoint, setAsStart, removeWaypoint, addWaypoint, t])

  function handlePickCircleCenter() {
    requestPoint((lat, lng) => {
      const pt = { lat, lng }
      setCircleCenter(pt)
      setCircleCenterText(formatPoint(pt))
    })
  }

  function handleCircleCenterTextChange(value: string) {
    setCircleCenterText(value)
    const parsed = parsePoint(value)
    if (parsed) setCircleCenter(parsed)
  }

  async function handleStart() {
    if (!deviceId || validWaypoints.length < 2) return
    setStatus({ kind: 'busy' })
    try {
      const result = await startRouteLoop(
        deviceId,
        navMode,
        validWaypoints,
        { enabled: pauseEnabled, min: pauseMin, max: pauseMax },
        speedKmh,
        straightLine
      )
      setRoutePath(result.route)
      setRouteLegs(result.legs)
      pushHistory({ lat: validWaypoints[0].lat, lng: validWaypoints[0].lng, kind: 'route_loop' }).catch(() => {})
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('routeloop.status.failed_start') })
    }
  }

  async function handleStop() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      await stopRouteLoop(deviceId)
      setRoutePath([])
      setRouteLegs([])
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('routeloop.status.failed_stop') })
    }
  }

  async function handlePauseResume() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      if (isPaused) {
        await resumeRouteLoop(deviceId)
      } else {
        await pauseRouteLoop(deviceId)
      }
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('routeloop.status.failed_update') })
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

  return (
    <div className="panel">
      <ModePanelLayout
        title={t('routeloop.title')}
        titleStatus={isActive ? <Badge size="sm" variant="light" color={isPaused ? 'yellow' : 'green'}>{isPaused ? t('panel.paused') : t('generic.working')}</Badge> : undefined}
        headerAction={<ModeInfoTooltip description={t('routeloop.description')} />}
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
        status={status.kind === 'busy'
          ? <PanelStatus state="busy" message={t('generic.working')} />
          : status.kind === 'error' ? <PanelStatus state="error" message={status.message} /> : undefined}
      >
      {isActive ? (
        <ActiveFlightHUD
          isRunning={isRunning}
          isPaused={isPaused}
          isBusy={isBusy}
          currentIndex={liveStopIndex ?? 1}
          totalPoints={validWaypoints.length || 2}
          liveEtaSeconds={liveEtaSeconds}
          livePosition={livePosition}
          routePath={effectivePath}
          waypoints={items.map((i) => i.point)}
          isLoop={true}
          connected={connected}
          onPauseResume={handlePauseResume}
          onStop={handleStop}
        />
      ) : (
        <>
          <PanelSection>
            <SegmentedControl fullWidth size="xs" disabled={isActive} value={subMode} onChange={(value) => {
              if (value === 'circle') {
                  setSubMode('circle')
                  if (circleCenter) {
                    const generated = pointsOnCircle(circleCenter, circleRadiusKm * 1000, circleCount)
                    setAllWaypoints(generated)
                  }
              } else setSubMode('manual')
            }} data={[{ label: t('routeloop.mode.manual'), value: 'manual' }, { label: t('routeloop.mode.circle'), value: 'circle' }]} />

          </PanelSection>

          {subMode === 'manual' ? (
            <PanelSection>
                <Stack gap="xs" className="route-loop-waypoint-list">
                  {items.map((item, idx) => (
                    <Group className="route-loop-waypoint-row" key={item.id} wrap="nowrap" gap="xs" ref={idx === items.length - 1 ? lastWaypointRef : undefined}>
                      <Badge variant="light" color="gray" circle>{idx + 1}</Badge>
                      <CoordinateField
                        size="xs"
                        placeholder="lat, lng or URL"
                        value={item.rawText}
                        style={{ flex: 1 }}
                        onFocus={() => {
                          if (suppressPointPickerRef.current) {
                            suppressPointPickerRef.current = false
                            return
                          }
                          requestPoint((lat, lng) => updateWaypoint(idx, { lat, lng }))
                        }}
                        onChange={(value) => handleTextChange(idx, value)}
                      />
                      <Group gap={2} wrap="nowrap">
                        <ActionIcon variant="subtle" disabled={idx === 0} onClick={() => moveWaypoint(idx, 'up')} aria-label="Move Up"><IconArrowUp size={16} /></ActionIcon>
                        <ActionIcon variant="subtle" disabled={idx === items.length - 1} onClick={() => moveWaypoint(idx, 'down')} aria-label="Move Down"><IconArrowDown size={16} /></ActionIcon>
                        <ActionIcon color="red" variant="subtle"
                          disabled={isLocked || items.length <= 2}
                          onClick={() => removeWaypoint(idx)}
                          title={t('panel.remove_waypoint')}
                        aria-label={t('panel.remove_waypoint')}><IconTrash size={16} /></ActionIcon>
                      </Group>
                    </Group>
                  ))}
                </Stack>

                <Group gap="xs" wrap="nowrap">
                  <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={handleAddWaypoint}>{t('panel.add_waypoint')}</Button>
                  <Tooltip label={t('routeloop.action.reverse')}>
                    <ActionIcon size="lg" variant="default" onClick={reverseWaypoints} aria-label={t('routeloop.action.reverse')}>
                      <IconRefresh size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={t('multistop.action.clear_all')}>
                    <ActionIcon size="lg" color="red" variant="light" onClick={handleClearAllWaypoints} aria-label={t('multistop.action.clear_all')}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
            </PanelSection>
          ) : (
            <PanelSection>
                <CoordinateField label={t('routeloop.circle.center')}
                    placeholder="Center (lat, lng or URL)"
                    value={circleCenterText}
                    onFocus={handlePickCircleCenter}
                    onChange={handleCircleCenterTextChange}
                    disabled={isActive}
                  />

                {livePosition && (
                  <Group mt={4}>
                    <Button size="xs" variant="default"
                      onClick={() => {
                        setCircleCenter(livePosition)
                        setCircleCenterText(formatPoint(livePosition))
                      }}
                      disabled={isActive}
                    >{t('routeloop.circle.use_current_location')}</Button>
                  </Group>
                )}

                <NumberInput mt="sm" label={t('routeloop.circle.radius')}
                    min={0.01}
                    step={0.1}
                    value={circleRadiusKm}
                    disabled={isActive}
                    onFocus={(e) => e.target.select()}
                    onChange={(value) => setCircleRadiusKm(Math.max(0.01, Number(value) || 0.01))}
                  />

                <Group grow gap="xs" wrap="nowrap">
                  {[0.5, 1, 2, 5].map((r) => (
                    <Button key={r} size="xs" variant={circleRadiusKm === r ? 'filled' : 'default'}
                      onClick={() => setCircleRadiusKm(r)}
                      disabled={isActive}
                    >{`${r}km`}</Button>
                  ))}
                </Group>

                <NumberInput mt="sm" label={t('routeloop.circle.count')}
                    min={4}
                    max={36}
                    value={circleCount}
                    disabled={isActive}
                    onFocus={(e) => e.target.select()}
                    onChange={(value) => {
                      const val = Math.max(4, Math.min(36, Number(value) || 4))
                      setCircleCount(val)
                    }}
                  />
            </PanelSection>
          )}

          <PanelSection>
            <SwitchBar
              label={t('multistop.straight_line')}
              checked={straightLine}
              onChange={setStraightLine}
              disabled={isActive}
            />

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
          </PanelSection>

          <PanelSection>
            <SpeedSlider
              valueKmh={speedKmh}
              navMode={navMode}
              onChange={setSpeedKmh}
              onNavModeChange={setNavMode}
              disabled={isActive}
            />
          </PanelSection>
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
