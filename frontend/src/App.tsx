import { useCallback, useEffect, useRef, useState } from 'react'
import { TopBar } from './components/layout/TopBar'
import { ControlsOverlay } from './components/layout/ControlsOverlay'
import { IconRail } from './components/layout/IconRail'
import { StatusBar } from './components/layout/StatusBar'
import { CommandPalette } from './components/layout/CommandPalette'
import { MapView } from './components/map/MapView'
import { PlaceSearchBar } from './components/map/PlaceSearchBar'
import type { Mode } from './components/ModeSelector'
import { type MapOverlay, type PanelProps } from './components/panels/types'
import { useDevices } from './hooks/useDevices'
import { useWebSocket } from './hooks/useWebSocket'

export default function App() {
  const [focusedDeviceId, setFocusedDeviceId] = useState<string | null>(null)
  const [modeByDevice, setModeByDevice] = useState<Record<string, Mode>>({})
  const [overlaysByDevice, setOverlaysByDevice] = useState<Record<string, MapOverlay>>({})
  const [pointByDevice, setPointByDevice] = useState<Record<string, { lat: number; lng: number } | null>>({})
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; id: number } | null>(null)
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false)
  const { connected, positions, states, send } = useWebSocket()
  const { devices, loading: devicesLoading, refresh: refreshDevices } = useDevices()

  const pendingPickRef = useRef<((lat: number, lng: number) => void) | null>(null)
  const flyIdRef = useRef(0)
  const requestPoint = useCallback((onPick: (lat: number, lng: number) => void) => {
    pendingPickRef.current = onPick
  }, [])
  const requestFlyTo = useCallback((lat: number, lng: number) => {
    flyIdRef.current += 1
    setFlyTo({ lat, lng, id: flyIdRef.current })
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function handleMapClick(lat: number, lng: number) {
    const pending = pendingPickRef.current
    if (pending) {
      pendingPickRef.current = null
      pending(lat, lng)
      return
    }
    if (focusedDeviceId) {
      setPointByDevice((prev) => ({ ...prev, [focusedDeviceId]: { lat, lng } }))
    }
  }

  // Keep a device focused whenever possible, and drop per-device state for devices that disconnected.
  useEffect(() => {
    const connectedIds = new Set(devices.map((d) => d.udid))

    setFocusedDeviceId((current) => {
      if (current && connectedIds.has(current)) return current
      return devices[0]?.udid ?? null
    })
    setModeByDevice((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([udid]) => connectedIds.has(udid)))
      return Object.keys(next).length === Object.keys(prev).length ? prev : next
    })
    setOverlaysByDevice((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([udid]) => connectedIds.has(udid)))
      return Object.keys(next).length === Object.keys(prev).length ? prev : next
    })
    setPointByDevice((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([udid]) => connectedIds.has(udid)))
      return Object.keys(next).length === Object.keys(prev).length ? prev : next
    })
  }, [devices])

  function handleModeChange(udid: string, mode: Mode) {
    setModeByDevice((prev) => ({ ...prev, [udid]: mode }))
  }

  function handleFocusChange(udid: string) {
    setFocusedDeviceId(udid)

    const live = positions[udid]
    if (live) {
      requestFlyTo(live.lat, live.lng)
      return
    }
    const firstMarker = overlaysByDevice[udid]?.markers[0]
    if (firstMarker) {
      requestFlyTo(firstMarker.lat, firstMarker.lng)
      return
    }
    const point = pointByDevice[udid]
    if (point) requestFlyTo(point.lat, point.lng)
  }

  const connectedIds = new Set(devices.map((d) => d.udid))
  const livePositions = Object.fromEntries(
    Object.entries(positions)
      .filter(([udid]) => connectedIds.has(udid))
      .map(([udid, p]) => [udid, { lat: p.lat, lng: p.lng }])
  )

  function panelPropsFor(udid: string): PanelProps {
    const device = devices.find((d) => d.udid === udid) ?? null
    const position = positions[udid]
    return {
      deviceId: udid,
      device,
      deviceState: states[udid] ?? 'idle',
      point: pointByDevice[udid] ?? null,
      livePosition: position ? { lat: position.lat, lng: position.lng } : null,
      liveEtaSeconds: position?.etaSeconds ?? null,
      liveStopIndex: position?.stopIndex ?? null,
      requestPoint,
      clearPoint: () => setPointByDevice((prev) => ({ ...prev, [udid]: null })),
      setOverlay: (overlay: MapOverlay) => setOverlaysByDevice((prev) => ({ ...prev, [udid]: overlay })),
      requestFlyTo,
      sendWs: send,
    }
  }

  const focusedPosition = focusedDeviceId ? positions[focusedDeviceId] ?? null : null
  const focusedDeviceState = (focusedDeviceId ? states[focusedDeviceId] : undefined) ?? 'idle'
  const focusedPoint = focusedDeviceId ? pointByDevice[focusedDeviceId] ?? null : null

  return (
    <div className="app">
      <TopBar
        connected={connected}
        focusedDeviceId={focusedDeviceId}
        onFocusChange={handleFocusChange}
        devices={devices}
        deviceStates={states}
        modeByDevice={modeByDevice}
        positions={positions}
        overlaysByDevice={overlaysByDevice}
        devicesLoading={devicesLoading}
        onRefreshDevices={refreshDevices}
        onOpenCmdPalette={() => setCmdPaletteOpen(true)}
      />
      <div className="app-body">
        <MapView
          onMapClick={handleMapClick}
          focusedDeviceId={focusedDeviceId}
          selectedPoint={focusedPoint}
          livePositions={livePositions}
          overlays={overlaysByDevice}
          flyTo={flyTo}
        >
          <ControlsOverlay
            devices={devices}
            focusedDeviceId={focusedDeviceId}
            modeByDevice={modeByDevice}
            onModeChange={handleModeChange}
            panelPropsFor={panelPropsFor}
          />
          <IconRail onFlyTo={requestFlyTo} />
          <div className="overlay-status-dock">
            <PlaceSearchBar
              onSelectPlace={(lat, lng) => {
                requestFlyTo(lat, lng)
                handleMapClick(lat, lng)
              }}
            />
            <StatusBar
              deviceState={focusedDeviceState}
              livePosition={focusedPosition ? { lat: focusedPosition.lat, lng: focusedPosition.lng } : null}
              liveSpeedMps={focusedPosition?.speedMps ?? null}
              lat={focusedDeviceId ? pointByDevice[focusedDeviceId]?.lat ?? null : null}
              lng={focusedDeviceId ? pointByDevice[focusedDeviceId]?.lng ?? null : null}
            />
          </div>
        </MapView>
      </div>

      <CommandPalette
        isOpen={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        onSelectMode={(mode) => {
          if (focusedDeviceId) handleModeChange(focusedDeviceId, mode)
        }}
        onFlyTo={requestFlyTo}
        onRefreshDevices={refreshDevices}
      />
    </div>
  )
}
