import type { Device } from '../../services/api'
import type { FlowerProgress } from '../../hooks/useWebSocket'

export type LatLng = { lat: number; lng: number }

export type DeviceState =
  | 'idle'
  | 'teleporting'
  | 'navigating'
  | 'looping'
  | 'random_walk'
  | 'joystick'
  | 'paused'
  | 'paused:navigating'
  | 'paused:looping'
  | 'paused:random_walk'
  | 'paused:joystick'

export type OverlayMarker = {
  id: string
  lat: number
  lng: number
  color: string
  label?: string
  title?: string
  draggable?: boolean
  isHovered?: boolean
  pathIndex?: number
  onDrag?: (lat: number, lng: number) => void
  onDragEnd?: (lat: number, lng: number, rollback?: () => void) => void
  onContextMenu?: (e: { lat: number; lng: number; clientX: number; clientY: number }) => void
}
export type OverlayCircle = {
  /** Stable within an overlay. It prevents a circle being recreated on every preview update. */
  id?: string
  lat: number
  lng: number
  radiusMeters: number
  color?: string
  fillColor?: string
  fillOpacity?: number
  opacity?: number
  weight?: number
  dashArray?: string
}
export type OverlayLink = {
  id: string
  from: LatLng
  to: LatLng
  color?: string
  opacity?: number
  weight?: number
  dashArray?: string
}
export type MapOverlay = {
  markers: OverlayMarker[]
  path: LatLng[]
  /** The leg currently being travelled. It is highlighted and receives animated arrows. */
  activePath?: LatLng[] | null
  /** Legacy one-circle API. Prefer circles for a preview containing multiple ranges. */
  circle?: OverlayCircle | null
  /** Extra range rings, e.g. one flower radius per waypoint. */
  circles?: OverlayCircle[]
  /** Lightweight visual-only links, e.g. flower centre → suggested fruit point. */
  links?: OverlayLink[]
  onPathClick?: (lat: number, lng: number) => void
  onMapContextMenu?: (e: { lat: number; lng: number; clientX: number; clientY: number }) => void
}

export const EMPTY_OVERLAY: MapOverlay = { markers: [], path: [], circle: null, circles: [], links: [] }

export type PanelProps = {
  deviceId: string | null
  device: Device | null
  deviceState: DeviceState
  point: LatLng | null
  livePosition: LatLng | null
  liveSpeedMps?: number | null
  liveEtaSeconds: number | null
  liveStopIndex: number | null
  flowerProgress?: FlowerProgress | null
  restoredAt?: number
  connected?: boolean
  setPoint: (point: LatLng | null) => void
  requestPoint: (onPick: (lat: number, lng: number) => void) => void
  clearPoint?: () => void
  setOverlay: (overlay: MapOverlay) => void
  requestFlyTo: (lat: number, lng: number) => void
  sendWs: (type: string, data: unknown, udid?: string) => void
  restoreAll?: () => Promise<{ restored: number; failed: number }>
}
