import type { Device } from '../../services/api'

export type LatLng = { lat: number; lng: number }
export type DeviceState = 'idle' | 'teleporting' | 'navigating' | 'looping' | 'random_walk' | 'joystick' | 'paused'

export type OverlayMarker = {
  id: string
  lat: number
  lng: number
  color: string
  label?: string
  title?: string
  draggable?: boolean
  isHovered?: boolean
  onDrag?: (lat: number, lng: number) => void
  onDragEnd?: (lat: number, lng: number) => void
  onContextMenu?: (e: { lat: number; lng: number; clientX: number; clientY: number }) => void
}
export type OverlayCircle = { lat: number; lng: number; radiusMeters: number }
export type MapOverlay = {
  markers: OverlayMarker[]
  path: LatLng[]
  circle?: OverlayCircle | null
  onPathClick?: (lat: number, lng: number) => void
  onMapContextMenu?: (e: { lat: number; lng: number; clientX: number; clientY: number }) => void
}

export const EMPTY_OVERLAY: MapOverlay = { markers: [], path: [], circle: null }

export type PanelProps = {
  deviceId: string | null
  device: Device | null
  deviceState: DeviceState
  point: LatLng | null
  livePosition: LatLng | null
  liveEtaSeconds: number | null
  liveStopIndex: number | null
  requestPoint: (onPick: (lat: number, lng: number) => void) => void
  clearPoint?: () => void
  setOverlay: (overlay: MapOverlay) => void
  requestFlyTo: (lat: number, lng: number) => void
  sendWs: (type: string, data: unknown, udid?: string) => void
}
