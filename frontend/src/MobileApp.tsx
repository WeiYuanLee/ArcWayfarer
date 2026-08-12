import { useCallback, useEffect, useRef, useState } from 'react'
import { MapView } from './components/map/MapView'
import { FavoritesDrawer } from './components/layout/FavoritesDrawer'
import { HistoryDrawer } from './components/layout/HistoryDrawer'
import { ToastContainer } from './components/common/Toast'
import { PANEL_BY_MODE } from './components/panels'
import type { Mode } from './components/ModeSelector'
import { type MapOverlay, type PanelProps, EMPTY_OVERLAY } from './components/panels/types'
import { useDevices } from './hooks/useDevices'
import { useWebSocket } from './hooks/useWebSocket'
import { useT } from './i18n'
import type { StringKey } from './i18n'

type SheetState = 'collapsed' | 'half' | 'full'

const MOBILE_MODES: { id: Mode; labelKey: StringKey; icon: string }[] = [
  { id: 'teleport',    labelKey: 'mode.teleport',    icon: '📍' },
  { id: 'navigate',    labelKey: 'mode.navigate',    icon: '🧭' },
  { id: 'multi-stop',  labelKey: 'mode.multi_stop',  icon: '📌' },
  { id: 'route-loop',  labelKey: 'mode.route_loop',  icon: '🔁' },
  { id: 'random-walk', labelKey: 'mode.random_walk', icon: '🎲' },
]

export default function MobileApp() {
  const t = useT()
  const { connected, positions, states, send } = useWebSocket()
  const { devices, refresh: refreshDevices } = useDevices()

  const [focusedDeviceId, setFocusedDeviceId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('teleport')
  const [overlay, setOverlay] = useState<MapOverlay>(EMPTY_OVERLAY)
  const [pointByDevice, setPointByDevice] = useState<Record<string, { lat: number; lng: number } | null>>({})
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; id: number } | null>(null)

  const [sheetState, setSheetState] = useState<SheetState>('half')
  const [favOpen, setFavOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

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
      liveEtaSeconds: position?.etaSeconds ?? null,
      liveStopIndex: position?.stopIndex ?? null,
      connected,
      setPoint: (point) => {
        if (focusedDeviceId) setPointByDevice((prev) => ({ ...prev, [focusedDeviceId]: point }))
      },
      requestPoint,
      clearPoint: () => {
        if (focusedDeviceId) setPointByDevice((prev) => ({ ...prev, [focusedDeviceId]: null }))
      },
      setOverlay,
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

  const overlaysMap: Record<string, MapOverlay> = focusedDeviceId ? { [focusedDeviceId]: overlay } : {}

  return (
    <div className="mapp">
      {/* Top bar */}
      <div className="mapp-topbar">
        <span className={`mapp-dot ${connected ? 'mapp-dot--on' : 'mapp-dot--off'}`} />
        <span className="mapp-device-name">{deviceName ?? (connected ? t('panel.hint.select_device') : '未連線')}</span>
        {devices.length > 1 && (
          <select
            className="mapp-device-picker"
            value={focusedDeviceId ?? ''}
            onChange={(e) => setFocusedDeviceId(e.target.value)}
          >
            {devices.map((d) => <option key={d.udid} value={d.udid}>{d.name}</option>)}
          </select>
        )}
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
        />

        {/* FAB: favorites & history */}
        <div className="mapp-fabs">
          <button className="mapp-fab" onClick={() => setFavOpen(true)} aria-label={t('favorites.title')}>⭐</button>
          <button className="mapp-fab" onClick={() => setHistoryOpen(true)} aria-label={t('history.title')}>🕒</button>
        </div>

        {/* Pending pick hint */}
        {pendingPickRef.current && (
          <div className="mapp-pick-hint">點地圖選取位置</div>
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
        <div className="mapp-tabs">
          {MOBILE_MODES.map((m) => (
            <button
              key={m.id}
              className={`mapp-tab ${mode === m.id ? 'mapp-tab--active' : ''}`}
              onClick={() => { setMode(m.id); if (sheetState === 'collapsed') setSheetState('half') }}
            >
              <span className="mapp-tab-icon">{m.icon}</span>
              <span className="mapp-tab-label">{t(m.labelKey)}</span>
            </button>
          ))}
        </div>

        {/* Panel content */}
        <div className="mapp-panel-body">
          {focusedDeviceId
            ? <Panel {...panelProps()} />
            : <p className="mapp-hint">{t('panel.hint.select_device')}</p>
          }
        </div>
      </div>

      <FavoritesDrawer
        isOpen={favOpen}
        onClose={() => setFavOpen(false)}
        onSelectFavorite={handleFavoriteSelect}
      />
      <HistoryDrawer
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onFlyTo={requestFlyTo}
      />
      <ToastContainer />
    </div>
  )
}
