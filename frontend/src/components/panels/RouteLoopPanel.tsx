import { useEffect, useRef, useState } from 'react'
import { ActionIcon, Badge, Button, Group, NumberInput, SegmentedControl, SimpleGrid, Stack, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconCircle, IconHeart, IconInfinity, IconPlus, IconRefresh, IconSquare, IconStar, IconTrash, IconTriangle, IconTypography } from '@tabler/icons-react'
import { pauseRouteLoop, pushHistory, resumeRouteLoop, setLocation, startRouteLoop, stopRouteLoop, type NavMode } from '../../services/api'
import type { LatLng, PanelProps } from './types'
import { EMPTY_OVERLAY } from './types'
import { formatPoint, parsePoint, pointsForPattern, routeLegForStop, type PatternTemplate } from './coords'
import { contoursToCoordinates, limitTextContours, loadTextPatternFont, orderTextContoursForTraversal, outerTextContours, simplifyCoordinatePath, TEXT_PATTERN_FONT_LOAD_ERROR, textContours, type TextRouteFont, unsupportedFontCharacters, validateTextPattern } from './textPattern'
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
type SubMode = 'manual' | 'pattern'

const WAYPOINT_COLOR = '#4a9af0'

export function RouteLoopPanel({ deviceId, device, deviceState, livePosition, liveSpeedMps, liveStopIndex, liveEtaSeconds, connected, requestPoint, setOverlay }: PanelProps) {
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
  
  // Pattern sub-mode states
  const [patternCenter, setPatternCenter] = useState<LatLng | null>(null)
  const [patternCenterText, setPatternCenterText] = useState('')
  const [patternSizeKm, setPatternSizeKm] = useState(0.2)
  const [patternTemplate, setPatternTemplate] = useState<PatternTemplate>('circle')
  const [patternRotation, setPatternRotation] = useState(0)
  const [patternDetail, setPatternDetail] = useState<'low' | 'medium' | 'high'>('medium')
  const [patternText, setPatternText] = useState('')
  const [textFont, setTextFont] = useState<TextRouteFont>('black')
  const [textPatternError, setTextPatternError] = useState<string | null>(null)
  const [textPreviewPaths, setTextPreviewPaths] = useState<LatLng[][]>([])
  const [textJumpLegIndices, setTextJumpLegIndices] = useState<number[]>([])

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

  const deviceReady = device?.status === 'ready'
  const isRunning = deviceState === 'looping'
  const isPaused = deviceState === 'paused:looping'
  const isActive = isRunning || isPaused
  const isBusy = status.kind === 'busy'
  const textCapacity = validateTextPattern(patternText)
  const textCapacityError = textCapacity.error === 'empty' ? t('routeloop.pattern.error.empty')
    : textCapacity.error === 'emoji' ? t('routeloop.pattern.error.emoji')
      : textCapacity.error === 'chinese_limit' ? t('routeloop.pattern.error.chinese_limit')
        : textCapacity.error === 'english_limit' ? t('routeloop.pattern.error.english_limit')
          : undefined
  const isPattern = subMode === 'pattern'
  // The pattern editor needs a viewport-sized, scrollable card. Once a route
  // is active we render the compact flight HUD instead, so retaining that
  // editor layout would leave a large empty panel beneath the controls.
  const isPatternEditor = isPattern && !isActive
  const isTextPattern = subMode === 'pattern' && patternTemplate === 'text'
  const canStart = deviceReady && !isActive && validWaypoints.length >= 2 && !isBusy && (!isTextPattern || (textCapacity.valid && !textPatternError))

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
    if (!patternCenter && livePosition && !patternCenterText) {
      setPatternCenter(livePosition)
      setPatternCenterText(formatPoint(livePosition))
    }
  }, [livePosition, patternCenter, patternCenterText])

  // Recalculate pattern waypoints when pattern options change.
  useEffect(() => {
    if (subMode === 'pattern' && patternCenter) {
      const radiusM = Math.max(0, patternSizeKm * 1000)
      const requestedCount = patternDetail === 'low' ? 16 : patternDetail === 'medium' ? 32 : 72
      const count = straightLine ? requestedCount : Math.min(36, requestedCount)
      if (patternTemplate === 'text') {
        if (!textCapacity.valid) {
          setAllWaypoints([])
          setTextPreviewPaths([])
          setTextJumpLegIndices([])
          return
        }
        let cancelled = false
        setTextPatternError(null)
        const contourPromise = loadTextPatternFont(textFont).then((font) => {
          const unsupported = unsupportedFontCharacters(font, patternText)
          if (unsupported.length) throw new Error(`${t('routeloop.pattern.error.font_unsupported')}${unsupported.join('、')}`)
          return textContours(font, patternText)
        })
        void contourPromise.then((rawContours) => {
          if (cancelled) return
          const contours = limitTextContours(orderTextContoursForTraversal(contoursToCoordinates(outerTextContours(rawContours), patternCenter, radiusM * 2, patternRotation).map((path) => {
            // Clipper rings are implicitly closed, while Leaflet/MapLibre
            // polylines are not. Simplify the open ring first, then append the
            // first coordinate so the final Z edge is both visible and walked.
            const simplified = simplifyCoordinatePath(path, Math.max(2, radiusM / 180))
            return simplified.length > 1 ? [...simplified, simplified[0]] : simplified
          })))
          const points = contours.flat()
          if (points.length < 2) throw new Error(t('routeloop.pattern.error.no_contours'))
          setAllWaypoints(points)
          setTextPreviewPaths(contours)
          // Each independent contour is walked normally.  Moving to another
          // contour (including the final loop back to the first) is a jump.
          let offset = 0
          const jumps = contours.slice(0, -1).map((contour) => {
            offset += contour.length
            return offset - 1
          })
          jumps.push(points.length - 1)
          setTextJumpLegIndices(jumps)
        }).catch((error: unknown) => {
          if (!cancelled) {
            setAllWaypoints([])
            setTextPreviewPaths([])
            setTextJumpLegIndices([])
            setTextPatternError(error instanceof Error && error.message === TEXT_PATTERN_FONT_LOAD_ERROR
              ? t('routeloop.pattern.error.font_load_failed')
              : error instanceof Error ? error.message : t('routeloop.pattern.error.generation_failed'))
          }
        })
        return () => { cancelled = true }
      }
      const generated = pointsForPattern(patternCenter, radiusM, count, patternTemplate, patternRotation)
      setAllWaypoints(generated)
      setTextPreviewPaths([])
      setTextJumpLegIndices([])
    }
  }, [subMode, patternCenter, patternSizeKm, setAllWaypoints, patternTemplate, patternRotation, patternDetail, straightLine, patternText, textCapacity.valid, textFont, t])

  useEffect(() => {
    setOverlay({
      // Generated patterns can have dozens of sampled points. Keep their
      // geometry readable by showing only the editable center marker.
      markers: isPattern
        ? (patternCenter ? [{ id: 'pattern-center', lat: patternCenter.lat, lng: patternCenter.lng, color: '#f97316', label: '⊙', title: t('routeloop.circle.center') }] : [])
        : items
        .map((item, idx) =>
          item.point
            ? {
                id: `loop-${idx}`,
                lat: item.point.lat,
                lng: item.point.lng,
                color: WAYPOINT_COLOR,
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
      path: isTextPattern ? [] : effectivePath,
      previewPaths: isTextPattern ? textPreviewPaths : [],
      // Inter-contour travel is not part of the glyph preview. It will be
      // planned separately, never rendered as a line between characters.
      links: [],
      activePath: isTextPattern ? null : activePath,
      circle: subMode === 'pattern' && patternTemplate === 'circle' && patternCenter && patternSizeKm > 0
        ? { lat: patternCenter.lat, lng: patternCenter.lng, radiusMeters: patternSizeKm * 1000 }
        : null,
      onPathClick: (lat, lng) => {
        if (isLocked || subMode === 'pattern') return
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
            disabled: isLocked || subMode === 'pattern',
              onClick: () => addWaypoint({ lat, lng }),
            },
            {
              id: 'select-circle-center',
              label: t('contextmenu.select_circle_center'),
              disabled: isLocked,
              onClick: () => {
                const pt = { lat, lng }
                setPatternCenter(pt)
                setPatternCenterText(formatPoint(pt))
                if (subMode !== 'pattern') {
                  setSubMode('pattern')
                  setStraightLine(true)
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
  }, [items, effectivePath, activePath, isLocked, deviceState, deviceId, setOverlay, subMode, patternCenter, patternSizeKm, isPattern, isTextPattern, textPreviewPaths, updateWaypoint, setAsStart, removeWaypoint, addWaypoint, t])

  function handlePickPatternCenter() {
    requestPoint((lat, lng) => {
      const pt = { lat, lng }
      setPatternCenter(pt)
      setPatternCenterText(formatPoint(pt))
    })
  }

  function handlePatternCenterTextChange(value: string) {
    setPatternCenterText(value)
    const parsed = parsePoint(value)
    if (parsed) setPatternCenter(parsed)
  }

  async function handleStart() {
    if (!deviceId || validWaypoints.length < 2) return
    setStatus({ kind: 'busy' })
    try {
      const result = await startRouteLoop(
        deviceId,
        navMode,
        validWaypoints,
        isTextPattern ? { enabled: false, min: 0, max: 0 } : { enabled: pauseEnabled, min: pauseMin, max: pauseMax },
        speedKmh,
        straightLine,
        isTextPattern ? textJumpLegIndices : []
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

  const patternOptions = [
    { value: 'circle' as const, label: t('routeloop.pattern.circle'), Icon: IconCircle },
    { value: 'square' as const, label: t('routeloop.pattern.square'), Icon: IconSquare },
    { value: 'triangle' as const, label: t('routeloop.pattern.triangle'), Icon: IconTriangle },
    { value: 'heart' as const, label: t('routeloop.pattern.heart'), Icon: IconHeart },
    { value: 'infinity' as const, label: t('routeloop.pattern.infinity'), Icon: IconInfinity },
    { value: 'star' as const, label: t('routeloop.pattern.star'), Icon: IconStar },
    { value: 'text' as const, label: t('routeloop.pattern.text'), Icon: IconTypography },
  ]

  return (
    <div className={`panel route-loop-panel${isPatternEditor ? ' route-loop-panel--pattern-editor' : ''}${isPatternEditor && patternTemplate === 'circle' ? ' route-loop-panel--compact-pattern' : ''}`}>
      <ModePanelLayout
        title={t('routeloop.title')}
        titleStatus={isActive ? <Badge size="sm" variant="light" color={isPaused ? 'yellow' : 'green'}>{isPaused ? t('panel.paused') : t('generic.working')}</Badge> : undefined}
        headerAction={<ModeInfoTooltip description={t('routeloop.description')} />}
        notices={!isActive ? notices : undefined}
        scrollable={!isPattern}
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
          liveSpeedMps={liveSpeedMps ?? null}
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
              if (value === 'pattern') {
                  setSubMode('pattern')
                  setStraightLine(true)
              } else setSubMode('manual')
            }} data={[{ label: t('routeloop.mode.manual'), value: 'manual' }, { label: t('routeloop.mode.circle'), value: 'pattern' }]} />

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
            <Stack gap="lg">
              <PanelSection title={t('routeloop.pattern.position_size')}>
                <CoordinateField label={t('routeloop.pattern.center')}
                    placeholder="Center (lat, lng or URL)"
                    value={patternCenterText}
                    onFocus={handlePickPatternCenter}
                    onChange={handlePatternCenterTextChange}
                    disabled={isActive}
                  />

                {livePosition && (
                  <Group mt={4}>
                    <Button size="xs" variant="default"
                      onClick={() => {
                        setPatternCenter(livePosition)
                        setPatternCenterText(formatPoint(livePosition))
                      }}
                      disabled={isActive}
                    >{t('routeloop.pattern.use_current_location')}</Button>
                  </Group>
                )}

                <NumberInput mt="sm" label={patternTemplate === 'text' ? t('routeloop.pattern.text_width') : t('routeloop.pattern.size')}
                    min={0.01}
                    step={0.1}
                    value={patternSizeKm}
                    disabled={isActive}
                    onFocus={(e) => e.target.select()}
                    onChange={(value) => setPatternSizeKm(Math.max(0.01, Number(value) || 0.01))}
                  />
              </PanelSection>

              <PanelSection title={t('routeloop.pattern.content')}>
                <SimpleGrid cols={4} spacing="xs">
                  {patternOptions.map(({ value, label, Icon }) => (
                    <Tooltip key={value} label={label} withArrow>
                      <UnstyledButton
                        className={`pattern-template-tile${value === 'text' ? ' pattern-template-tile--text' : ''}`}
                        data-active={patternTemplate === value || undefined}
                        onClick={() => setPatternTemplate(value)}
                        disabled={isActive}
                        aria-label={label}
                        aria-pressed={patternTemplate === value}
                      >
                        <Icon size={18} stroke={1.8} />
                        <Text component="span" size="xs" fw={600}>{label}</Text>
                      </UnstyledButton>
                    </Tooltip>
                  ))}
                </SimpleGrid>

                {patternTemplate === 'text' && <TextInput mt="sm" label={t('routeloop.pattern.custom_text')} value={patternText} onChange={(event) => setPatternText(event.currentTarget.value)} error={textPatternError ?? textCapacityError} description={`${t('routeloop.pattern.chinese')} ${textCapacity.chinese}/5 · ${t('routeloop.pattern.english_letters')} ${textCapacity.englishLetters}/12`} disabled={isActive} />}
                {patternTemplate === 'text' && <SegmentedControl mt="xs" fullWidth size="xs" value={textFont} onChange={(value) => setTextFont(value as TextRouteFont)} data={[{ label: t('routeloop.pattern.font_regular'), value: 'regular' }, { label: t('routeloop.pattern.font_black'), value: 'black' }]} />}

                {patternTemplate !== 'circle' && <NumberInput mt="sm" label={t('routeloop.pattern.rotation')} min={0} max={359} value={patternRotation} disabled={isActive} onChange={(value) => setPatternRotation(Math.max(0, Math.min(359, Number(value) || 0)))} />}
              </PanelSection>

              <PanelSection title={t('routeloop.pattern.quality')}>
                <SegmentedControl fullWidth size="xs" value={patternDetail} onChange={(value) => setPatternDetail(value as typeof patternDetail)} data={[{ label: t('routeloop.pattern.detail_low'), value: 'low' }, { label: t('routeloop.pattern.detail_standard'), value: 'medium' }, { label: t('routeloop.pattern.detail_high'), value: 'high' }]} />
              </PanelSection>
              <PanelSection title={t('routeloop.pattern.movement')}>
                <SpeedSlider
                  valueKmh={speedKmh}
                  navMode={navMode}
                  onChange={setSpeedKmh}
                  onNavModeChange={setNavMode}
                  disabled={isActive}
                />
              </PanelSection>
            </Stack>
          )}

          {subMode === 'manual' && <>
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
          </>}
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
