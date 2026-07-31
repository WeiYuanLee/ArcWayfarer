import { useCallback, useEffect, useRef, useState } from 'react'
import { TopBar } from './components/layout/TopBar'
import { ControlsOverlay } from './components/layout/ControlsOverlay'
import { IconRail } from './components/layout/IconRail'
import { StatusBar } from './components/layout/StatusBar'
import { MapView } from './components/map/MapView'
import type { Mode } from './components/ModeSelector'
import { EMPTY_OVERLAY, type MapOverlay, type PanelProps } from './components/panels/types'
import { useDevices } from './hooks/useDevices'
import { useWebSocket } from './hooks/useWebSocket'

export default function App() {
  const [focusedDeviceId, setFocusedDeviceId] = useState<string | null>(null)
  const [modeByDevice, setModeByDevice] = useState<Record<string, Mode>>({})
  const [overlaysByDevice, setOverlaysByDevice] = useState<Record<string, MapOverlay>>({})
  const [pointByDevice, setPointByDevice] = useState<Record<string, { lat: number; lng: number } | null>>({})
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; id: number } | null>(null)
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

  const livePositions = Object.fromEntries(
    Object.entries(positions).map(([udid, p]) => [udid, { lat: p.lat, lng: p.lng }])
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
      setOverlay: (overlay: MapOverlay) => setOverlaysByDevice((prev) => ({ ...prev, [udid]: overlay })),
      requestFlyTo,
      sendWs: send,
    }
  }

  const focusedPosition = focusedDeviceId ? positions[focusedDeviceId] ?? null : null
  const focusedDeviceState = (focusedDeviceId ? states[focusedDeviceId] : undefined) ?? 'idle'

  return (
    <div className="app">
      <TopBar
        connected={connected}
        focusedDeviceId={focusedDeviceId}
        onFocusChange={setFocusedDeviceId}
        devices={devices}
        deviceStates={states}
        devicesLoading={devicesLoading}
        onRefreshDevices={refreshDevices}
      />
      <div className="app-body">
        <MapView onMapClick={handleMapClick} livePositions={livePositions} overlays={overlaysByDevice} flyTo={flyTo}>
          <ControlsOverlay
            devices={devices}
            focusedDeviceId={focusedDeviceId}
            modeByDevice={modeByDevice}
            onModeChange={handleModeChange}
            panelPropsFor={panelPropsFor}
          />
          <IconRail onFlyTo={requestFlyTo} />
          <div className="overlay-status-dock">
            <StatusBar
              navigating={focusedDeviceState === 'navigating'}
              livePosition={focusedPosition ? { lat: focusedPosition.lat, lng: focusedPosition.lng } : null}
              liveSpeedMps={focusedPosition?.speedMps ?? null}
              lat={focusedDeviceId ? pointByDevice[focusedDeviceId]?.lat ?? null : null}
              lng={focusedDeviceId ? pointByDevice[focusedDeviceId]?.lng ?? null : null}
            />
          </div>
        </MapView>
      </div>
    </div>
  )
}
