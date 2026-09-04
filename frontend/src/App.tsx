import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TopBar } from './components/layout/TopBar'
import { ControlsOverlay } from './components/layout/ControlsOverlay'
import { IconRail } from './components/layout/IconRail'
import { StatusBar } from './components/layout/StatusBar'
import { CommandPalette } from './components/layout/CommandPalette'
import { ToastContainer } from './components/common/Toast'
import { MapView } from './components/map/MapView'
import type { Mode } from './components/ModeSelector'
import { type MapOverlay, type PanelProps } from './components/panels/types'
import { useDevices } from './hooks/useDevices'
import { useWebSocket } from './hooks/useWebSocket'
import { useUpdateChecker } from './hooks/useUpdateChecker'
import { UpdateModal } from './components/common/UpdateModal'
import { clearLocation } from './services/api'
import { useHiddenDevices } from './hooks/useHiddenDevices'
import { useDeviceNames } from './hooks/useDeviceNames'
import { DeviceManagerModal } from './components/common/DeviceManagerModal'
import { showToast } from './components/common/Toast'
import { useT } from './i18n'

const WIFI_DISCOVERY_STORAGE_KEY = 'arcwayfarer.include-wifi-discovery'
const MAX_USABLE_DEVICES = 3

function readWifiDiscoveryPreference(): boolean {
  try {
    return window.localStorage.getItem(WIFI_DISCOVERY_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export default function App() {
  const t = useT()
  const [focusedDeviceId, setFocusedDeviceId] = useState<string | null>(null)
  const [modeByDevice, setModeByDevice] = useState<Record<string, Mode>>({})
  const [overlaysByDevice, setOverlaysByDevice] = useState<Record<string, MapOverlay>>({})
  const [pointByDevice, setPointByDevice] = useState<Record<string, { lat: number; lng: number } | null>>({})
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; id: number } | null>(null)
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false)
  const [includeWifi, setIncludeWifi] = useState(readWifiDiscoveryPreference)
  const [deviceManagerOpen, setDeviceManagerOpen] = useState(false)
  const [hidingDeviceId, setHidingDeviceId] = useState<string | null>(null)
  const { connected, positions, states, restoredAt, flowerProgress, send } = useWebSocket()
  const { devices: discoveredDevices, loading: devicesLoading, refresh: refreshDevices, discoveryDiagnostic } = useDevices(includeWifi)
  const { hiddenDevices, isHidden, hideDevice, unhideDevice } = useHiddenDevices()
  const { deviceNames, getDeviceName, setDeviceName } = useDeviceNames()
  const {
    checkResult,
    loading: loadingUpdate,
    modalOpen: updateModalOpen,
    performCheck: recheckUpdates,
    openUpdateModal,
    closeUpdateModal,
    hasUpdate,
    currentVersion,
    latestVersion,
  } = useUpdateChecker()

  // Discovery continues for every device, but only three unhidden devices may
  // enter the operational UI. Additional devices wait for the user to free a
  // slot in Device Manager, so they can never be selected accidentally.
  const visibleDevices = useMemo(
    () => discoveredDevices.filter((device) => !isHidden(device.udid)).slice(0, MAX_USABLE_DEVICES),
    [discoveredDevices, isHidden]
  )
  const usableDeviceIds = useMemo(() => visibleDevices.map((device) => device.udid), [visibleDevices])
  const displayDevices = useMemo(
    () => visibleDevices.map((device) => ({ ...device, name: getDeviceName(device.udid) || device.name })),
    [getDeviceName, visibleDevices]
  )


  const pendingPickRef = useRef<{
    deviceId: string
    onPick: (lat: number, lng: number) => void
  } | null>(null)
  const flyIdRef = useRef(0)
  const requestPointForDevice = useCallback((deviceId: string, onPick: (lat: number, lng: number) => void) => {
    pendingPickRef.current = { deviceId, onPick }
  }, [])
  const cancelPointRequest = useCallback(() => {
    pendingPickRef.current = null
  }, [])
  const handleIncludeWifiChange = useCallback((enabled: boolean) => {
    setIncludeWifi(enabled)
    try {
      window.localStorage.setItem(WIFI_DISCOVERY_STORAGE_KEY, String(enabled))
    } catch {
      // Persistence is optional; the in-session choice still applies.
    }
  }, [])
  const requestFlyTo = useCallback((lat: number, lng: number) => {
    flyIdRef.current += 1
    setFlyTo({ lat, lng, id: flyIdRef.current })
  }, [])
  const handleFavoriteSelect = useCallback((lat: number, lng: number) => {
    requestFlyTo(lat, lng)
    if (focusedDeviceId) {
      setPointByDevice((prev) => ({ ...prev, [focusedDeviceId]: { lat, lng } }))
    }
  }, [focusedDeviceId, requestFlyTo])
  const handleSelectedPointDragEnd = useCallback((lat: number, lng: number) => {
    if (!focusedDeviceId) return
    setPointByDevice((prev) => ({ ...prev, [focusedDeviceId]: { lat, lng } }))
  }, [focusedDeviceId])

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
      // A pending coordinate field belongs to the device that focused it.  Do
      // not let a stale field on another device consume this map click.
      if (pending.deviceId === focusedDeviceId) {
        pending.onPick(lat, lng)
        return
      }
    }
    if (focusedDeviceId) {
      setPointByDevice((prev) => ({ ...prev, [focusedDeviceId]: { lat, lng } }))
    }
  }

  // Keep a device focused whenever possible, and drop per-device state for devices that disconnected.
  useEffect(() => {
    const connectedIds = new Set(visibleDevices.map((d) => d.udid))

    setFocusedDeviceId((current) => {
      if (current && connectedIds.has(current)) return current
      return visibleDevices[0]?.udid ?? null
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
  }, [visibleDevices])

  function handleModeChange(udid: string, mode: Mode) {
    // A mode owns its temporary map input.  Clear it here rather than relying on
    // panel unmount cleanup, so both map engines receive the same empty state.
    const currentMode = modeByDevice[udid] ?? 'teleport'
    if (currentMode === mode) return

    setModeByDevice((prev) => ({ ...prev, [udid]: mode }))
    cancelPointRequest()
    setPointByDevice((prev) => ({ ...prev, [udid]: null }))
    setOverlaysByDevice((prev) => {
      if (!(udid in prev)) return prev
      const { [udid]: _clearedOverlay, ...remainingOverlays } = prev
      return remainingOverlays
    })
  }

  function handleFocusChange(udid: string) {
    // Coordinate fields arm the next map click.  Switching devices must never
    // leave the previous device's field armed.
    cancelPointRequest()
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

  const handlePlaceSelect = useCallback(
    (lat: number, lng: number) => {
      requestFlyTo(lat, lng)
      if (pendingPickRef.current) {
        handleMapClick(lat, lng)
        return
      }
      if (focusedDeviceId) {
        setPointByDevice((prev) => ({ ...prev, [focusedDeviceId]: { lat, lng } }))
      }
    },
    [requestFlyTo, focusedDeviceId]
  )

  const connectedIds = new Set(visibleDevices.map((d) => d.udid))
  const livePositions = Object.fromEntries(
    Object.entries(positions)
      .filter(([udid]) => connectedIds.size === 0 || connectedIds.has(udid))
      .map(([udid, p]) => [udid, { lat: p.lat, lng: p.lng }])
  )

  const setOverlayForDevice = useCallback((udid: string, overlay: MapOverlay) => {
    setOverlaysByDevice((prev) => {
      if (prev[udid] === overlay) return prev
      return { ...prev, [udid]: overlay }
    })
  }, [])

  const overlayCallbacksRef = useRef<Record<string, (overlay: MapOverlay) => void>>({})

  const getSetOverlayForDevice = useCallback((udid: string) => {
    if (!overlayCallbacksRef.current[udid]) {
      overlayCallbacksRef.current[udid] = (overlay: MapOverlay) => setOverlayForDevice(udid, overlay)
    }
    return overlayCallbacksRef.current[udid]
  }, [setOverlayForDevice])

  const restoreAll = useCallback(async () => {
    const restoreTargets = visibleDevices.filter((device) => device.status === 'ready')
    const results = await Promise.allSettled(restoreTargets.map((device) => clearLocation(device.udid)))
    return {
      restored: results.filter((result) => result.status === 'fulfilled').length,
      failed: results.filter((result) => result.status === 'rejected').length,
    }
  }, [visibleDevices])

  function panelPropsFor(udid: string): PanelProps {
    const device = displayDevices.find((d) => d.udid === udid) ?? null
    const position = positions[udid]
    return {
      deviceId: udid,
      device,
      deviceState: states[udid] ?? 'idle',
      point: pointByDevice[udid] ?? null,
      livePosition: position ? { lat: position.lat, lng: position.lng } : null,
      liveSpeedMps: position?.speedMps ?? null,
      liveEtaSeconds: position?.etaSeconds ?? null,
      liveStopIndex: position?.stopIndex ?? null,
      flowerProgress: flowerProgress[udid] ?? null,
      restoredAt: restoredAt[udid],
      connected,
      setPoint: (point) => setPointByDevice((prev) => ({ ...prev, [udid]: point })),
      requestPoint: (onPick) => requestPointForDevice(udid, onPick),
      cancelPointRequest,
      clearPoint: () => setPointByDevice((prev) => ({ ...prev, [udid]: null })),
      setOverlay: getSetOverlayForDevice(udid),
      requestFlyTo,
      sendWs: send,
      restoreAll: visibleDevices.length > 1 ? restoreAll : undefined,
    }
  }

  const focusedPosition = focusedDeviceId ? positions[focusedDeviceId] ?? null : null
  const focusedDeviceState = (focusedDeviceId ? states[focusedDeviceId] : undefined) ?? 'idle'
  const focusedPoint = focusedDeviceId ? pointByDevice[focusedDeviceId] ?? null : null
  const isMapEngineSwitchLocked = Object.values(states).some((state) =>
    ['navigating', 'looping', 'random_walk', 'joystick', 'paused'].includes(state)
  )

  const handleHideDevice = useCallback(async (device: typeof discoveredDevices[number]) => {
    if ((states[device.udid] ?? 'idle') !== 'idle') {
      showToast(t('device.manager.running'))
      return
    }
    setHidingDeviceId(device.udid)
    try {
      await clearLocation(device.udid)
      hideDevice(device)
      showToast(t('device.manager.hide_success'))
    } catch {
      showToast(t('device.manager.hide_failed'))
    } finally {
      setHidingDeviceId(null)
    }
  }, [hideDevice, states, t])

  const isUnhideDisabled = useCallback(() => visibleDevices.length >= MAX_USABLE_DEVICES, [visibleDevices.length])

  return (
    <div className="app">
      <TopBar
        connected={connected}
        focusedDeviceId={focusedDeviceId}
        onFocusChange={handleFocusChange}
        devices={displayDevices}
        deviceStates={states}
        modeByDevice={modeByDevice}
        positions={positions}
        overlaysByDevice={overlaysByDevice}
        devicesLoading={devicesLoading}
        onRefreshDevices={refreshDevices}
        includeWifi={includeWifi}
        onIncludeWifiChange={handleIncludeWifiChange}
        discoveryDiagnostic={discoveryDiagnostic}
        onOpenDeviceManager={() => setDeviceManagerOpen(true)}
        onOpenCmdPalette={() => setCmdPaletteOpen(true)}
        version={currentVersion}
        hasUpdate={hasUpdate}
        latestVersion={latestVersion}
        loadingUpdate={loadingUpdate}
        onOpenUpdateModal={openUpdateModal}
      />
      <div className="app-body">
        <MapView
          onMapClick={handleMapClick}
          focusedDeviceId={focusedDeviceId}
          selectedPoint={focusedPoint}
          onSelectedPointDragEnd={handleSelectedPointDragEnd}
          livePositions={livePositions}
          overlays={overlaysByDevice}
          flyTo={flyTo}
          isEngineSwitchLocked={isMapEngineSwitchLocked}
        >
          <ControlsOverlay
            devices={displayDevices}
            focusedDeviceId={focusedDeviceId}
            modeByDevice={modeByDevice}
            onModeChange={handleModeChange}
            panelPropsFor={panelPropsFor}
          />
          <IconRail onFlyTo={requestFlyTo} onSelectFavorite={handleFavoriteSelect} onSelectPlace={handlePlaceSelect} />
          <div className="overlay-status-dock">
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
        onSelectPlace={handlePlaceSelect}
        onRefreshDevices={refreshDevices}
        onOpenUpdateModal={openUpdateModal}
      />
      <UpdateModal
        isOpen={updateModalOpen}
        onClose={closeUpdateModal}
        checkResult={checkResult}
        loading={loadingUpdate}
        onRecheck={recheckUpdates}
      />
      <DeviceManagerModal
        isOpen={deviceManagerOpen}
        onClose={() => setDeviceManagerOpen(false)}
        devices={discoveredDevices}
        hiddenDevices={hiddenDevices}
        deviceNames={deviceNames}
        usableDeviceIds={usableDeviceIds}
        deviceStates={states}
        hidingDeviceId={hidingDeviceId}
        onHideDevice={handleHideDevice}
        onUnhideDevice={unhideDevice}
        onSetDeviceName={setDeviceName}
        isUnhideDisabled={isUnhideDisabled}
        unhideDisabledReason={() => t('device.manager.capacity')}
      />
      <ToastContainer />
    </div>
  )
}
