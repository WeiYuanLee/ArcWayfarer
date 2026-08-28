import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Badge, NativeSelect, Tabs, Text } from '@mantine/core'
import { IconMapPin, IconRoute, IconRoute2, IconWand, IconWalk } from '@tabler/icons-react'
import { MapView } from './components/map/MapView'
import { IconRail } from './components/layout/IconRail'
import { ToastContainer } from './components/common/Toast'
import { PANEL_BY_MODE } from './components/panels'
import type { Mode } from './components/ModeSelector'
import { type MapOverlay, type PanelProps, EMPTY_OVERLAY } from './components/panels/types'
import { useDevices } from './hooks/useDevices'
import { useWebSocket } from './hooks/useWebSocket'
import { useT } from './i18n'
import type { StringKey } from './i18n'
import { ColorSchemeControl } from './components/layout/ColorSchemeControl'

type SheetState = 'collapsed' | 'half' | 'full'

const MOBILE_MODES: { id: Mode; labelKey: StringKey; icon: typeof IconMapPin }[] = [
  { id: 'teleport',    labelKey: 'mode.teleport',    icon: IconMapPin },
  { id: 'navigate',    labelKey: 'mode.navigate',    icon: IconRoute },
  { id: 'multi-stop',  labelKey: 'mode.multi_stop',  icon: IconRoute2 },
  { id: 'route-loop',  labelKey: 'mode.route_loop',  icon: IconWand },
  { id: 'random-walk', labelKey: 'mode.random_walk', icon: IconWalk },
]

export default function MobileApp() {
  const t = useT()
  const { connected, positions, states, restoredAt, flowerProgress, activeTasks, send } = useWebSocket()
  const { devices, refresh: refreshDevices } = useDevices()

  const [focusedDeviceId, setFocusedDeviceId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('teleport')
  const [overlay, setOverlay] = useState<MapOverlay>(EMPTY_OVERLAY)
  const [pointByDevice, setPointByDevice] = useState<Record<string, { lat: number; lng: number } | null>>({})
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; id: number } | null>(null)
  const setActiveOverlay = useCallback((nextOverlay: MapOverlay) => {
    setOverlay((current) => current === nextOverlay ? current : nextOverlay)
  }, [])

  const [sheetState, setSheetState] = useState<SheetState>('half')
  // Bottom sheet drag
  const dragStartY = useRef<number | null>(null)
  const dragStartState = useRef<SheetState>('half')

  const flyIdRef = useRef(0)
  const pendingPickRef = useRef<((lat: number, lng: number) => void) | null>(null)

  const requestFlyTo = useCallback((lat: number, lng: number) => {
    flyIdRef.current += 1
    setFlyTo({ lat, lng, id: flyIdRef.current })
  }, [])

  const requestPoint = useCallback((onPick: (lat: number, lng: number) => void) => {
    pendingPickRef.current = onPick
    setSheetState('collapsed')
  }, [])

  useEffect(() => {
    const connectedIds = new Set(devices.map((d) => d.udid))
    setFocusedDeviceId((cur) => {
      if (cur && connectedIds.has(cur)) return cur
      return devices[0]?.udid ?? null
    })
    setPointByDevice((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([id]) => connectedIds.has(id)))
      return Object.keys(next).length === Object.keys(prev).length ? prev : next
    })
  }, [devices])

  function handleMapClick(lat: number, lng: number) {
    const pending = pendingPickRef.current
    if (pending) {
      pendingPickRef.current = null
      pending(lat, lng)
      setSheetState('half')
      return
    }
    if (focusedDeviceId) {
      setPointByDevice((prev) => ({ ...prev, [focusedDeviceId]: { lat, lng } }))
    }
  }

  const handleSelectedPointDragEnd = useCallback((lat: number, lng: number) => {
    if (!focusedDeviceId) return
    setPointByDevice((prev) => ({ ...prev, [focusedDeviceId]: { lat, lng } }))
  }, [focusedDeviceId])

  const handleFavoriteSelect = useCallback((lat: number, lng: number) => {
    requestFlyTo(lat, lng)
    if (focusedDeviceId) {
      setPointByDevice((prev) => ({ ...prev, [focusedDeviceId]: { lat, lng } }))
    }
  }, [focusedDeviceId, requestFlyTo])

  const handlePlaceSelect = useCallback((lat: number, lng: number) => {
    requestFlyTo(lat, lng)
    if (focusedDeviceId) {
      setPointByDevice((prev) => ({ ...prev, [focusedDeviceId]: { lat, lng } }))
    }
  }, [focusedDeviceId, requestFlyTo])

  const connectedIds = new Set(devices.map((d) => d.udid))
  const livePositions = Object.fromEntries(
    Object.entries(positions)
      .filter(([id]) => connectedIds.size === 0 || connectedIds.has(id))
      .map(([id, p]) => [id, { lat: p.lat, lng: p.lng }])
  )

  function panelProps(): PanelProps {
    const device = focusedDeviceId ? devices.find((d) => d.udid === focusedDeviceId) ?? null : null
    const position = focusedDeviceId ? positions[focusedDeviceId] : undefined
    return {
      deviceId: focusedDeviceId,
      device,
      deviceState: (focusedDeviceId ? states[focusedDeviceId] : undefined) ?? 'idle',
      point: focusedDeviceId ? pointByDevice[focusedDeviceId] ?? null : null,
      livePosition: position ? { lat: position.lat, lng: position.lng } : null,
      liveSpeedMps: position?.speedMps ?? null,
      liveEtaSeconds: position?.etaSeconds ?? null,
      liveStopIndex: position?.stopIndex ?? null,
      flowerProgress: focusedDeviceId ? flowerProgress[focusedDeviceId] ?? null : null,
      restoredAt: focusedDeviceId ? restoredAt[focusedDeviceId] : undefined,
      connected,
      setPoint: (point) => {
        if (focusedDeviceId) setPointByDevice((prev) => ({ ...prev, [focusedDeviceId]: point }))
      },
      requestPoint,
      clearPoint: () => {
        if (focusedDeviceId) setPointByDevice((prev) => ({ ...prev, [focusedDeviceId]: null }))
      },
      setOverlay: setActiveOverlay,
      requestFlyTo,
      sendWs: send,
    }
  }

  // Drag handle gestures
  function onHandleTouchStart(e: React.TouchEvent) {
    dragStartY.current = e.touches[0].clientY
    dragStartState.current = sheetState
  }

  function onHandleTouchEnd(e: React.TouchEvent) {
    if (dragStartY.current === null) return
    const delta = dragStartY.current - e.changedTouches[0].clientY
    if (delta > 40) {
      setSheetState(dragStartState.current === 'collapsed' ? 'half' : 'full')
    } else if (delta < -40) {
      setSheetState(dragStartState.current === 'full' ? 'half' : 'collapsed')
    }
    dragStartY.current = null
  }

  function cycleSheet() {
    setSheetState((s) => s === 'collapsed' ? 'half' : s === 'half' ? 'full' : 'collapsed')
  }

  const Panel = PANEL_BY_MODE[mode]
  const focusedPoint = focusedDeviceId ? pointByDevice[focusedDeviceId] ?? null : null
  const deviceName = focusedDeviceId ? (devices.find((d) => d.udid === focusedDeviceId)?.name ?? focusedDeviceId) : null

  const activeTask = focusedDeviceId ? activeTasks[focusedDeviceId] : undefined
  const overlaysMap: Record<string, MapOverlay> = focusedDeviceId ? {
    [focusedDeviceId]: activeTask?.path.length
      ? { ...EMPTY_OVERLAY, path: activeTask.path, activePath: activeTask.path }
      : overlay,
  } : {}

  return (
    <div className="mapp mobile-app">
      {/* Top bar */}
      <div className="mapp-topbar">
        <Badge className="mapp-connection" color={connected ? 'teal' : 'gray'} variant="light" size="sm" leftSection={<span className="mapp-dot" />}>
          {connected ? 'Connected' : 'Offline'}
        </Badge>
        <Text className="mapp-device-name" size="sm" fw={600} truncate>{activeTask ? `${deviceName ?? ''} · ${activeTask.kind === 'route_loop' ? t('routeloop.status.looping') : activeTask.kind === 'multi_stop' ? t('multistop.status.visiting') : activeTask.kind === 'flower' ? '種花模式' : t('navigate.status.running')}` : deviceName ?? (connected ? t('panel.hint.select_device') : '未連線')}</Text>
        {devices.length > 1 && (
          <NativeSelect
            className="mapp-device-picker"
            value={focusedDeviceId ?? ''}
            onChange={(e) => setFocusedDeviceId(e.target.value)}
            data={devices.map((d) => ({ value: d.udid, label: d.name }))}
            aria-label="Choose device"
            size="xs"
          />
        )}
        <ColorSchemeControl />
      </div>

      {/* Map full-screen */}
      <div className="mapp-map">
        <MapView
          onMapClick={handleMapClick}
          focusedDeviceId={focusedDeviceId}
          selectedPoint={focusedPoint}
          onSelectedPointDragEnd={handleSelectedPointDragEnd}
          livePositions={livePositions}
          overlays={overlaysMap}
          flyTo={flyTo}
        >
          <IconRail
            onFlyTo={requestFlyTo}
            onSelectFavorite={handleFavoriteSelect}
            onSelectPlace={handlePlaceSelect}
          />
        </MapView>

        {/* Pending pick hint */}
        {pendingPickRef.current && (
          <Alert className="mapp-pick-hint" variant="filled" color="arcBlue" icon={<IconMapPin size={16} />}>
            點地圖選取位置
          </Alert>
        )}
      </div>

      {/* Bottom sheet */}
      <div className={`mapp-sheet mapp-sheet--${sheetState}`}>
        {/* Drag handle */}
        <div
          className="mapp-sheet-handle"
          onTouchStart={onHandleTouchStart}
          onTouchEnd={onHandleTouchEnd}
          onClick={cycleSheet}
        >
          <div className="mapp-sheet-handle-bar" />
        </div>

        {/* Mode tab bar */}
        <Tabs
          className="mapp-tabs"
          value={mode}
          onChange={(value) => {
            if (!value) return
            setMode(value as Mode)
            if (sheetState === 'collapsed') setSheetState('half')
          }}
          variant="pills"
          keepMounted={false}
        >
          <Tabs.List grow>
            {MOBILE_MODES.map((m) => {
              const Icon = m.icon
              return <Tabs.Tab key={m.id} value={m.id} leftSection={<Icon size={15} stroke={1.8} />}>{t(m.labelKey)}</Tabs.Tab>
            })}
          </Tabs.List>
        </Tabs>

        {/* Panel content */}
        <div className="mapp-panel-body">
          {focusedDeviceId
            ? <Panel {...panelProps()} />
            : <Text className="mapp-hint" c="dimmed" size="sm">{t('panel.hint.select_device')}</Text>
          }
        </div>
      </div>

      <ToastContainer />
    </div>
  )
}
