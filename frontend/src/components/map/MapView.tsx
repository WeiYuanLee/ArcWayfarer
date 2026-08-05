import { useEffect, useRef, type ReactNode } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapOverlay } from '../panels/types'

const DEFAULT_CENTER: [number, number] = [25.0330, 121.5654]
const DEFAULT_ZOOM = 13

type LatLng = { lat: number; lng: number }

function makeBadgeIcon(color: string, label?: string, isDraggable = false): L.DivIcon {
  const cursorStyle = isDraggable ? 'cursor:grab;' : 'cursor:default;'
  return L.divIcon({
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:600;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);${cursorStyle}">${label ?? ''}</div>`,
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function makeArrowIcon(bearingDeg: number): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:8px solid #ffffff;opacity:0.95;transform:rotate(${bearingDeg}deg);"></div>`,
    className: '',
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  })
}

const EARTH_RADIUS_M = 6371000

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function haversineMeters(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

function bearingDegrees(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const dLng = toRad(b.lng - a.lng)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

const ARROW_SPACING_METERS = 180

function sampleArrowPoints(path: LatLng[]): { pos: LatLng; bearing: number }[] {
  const arrows: { pos: LatLng; bearing: number }[] = []
  let distanceSinceLastArrow = ARROW_SPACING_METERS / 2 // first arrow doesn't sit right on top of the start marker

  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const segLen = haversineMeters(a, b)
    if (segLen === 0) continue
    const segBearing = bearingDegrees(a, b)

    let coveredInSegment = 0
    while (distanceSinceLastArrow + (segLen - coveredInSegment) >= ARROW_SPACING_METERS) {
      coveredInSegment += ARROW_SPACING_METERS - distanceSinceLastArrow
      const t = coveredInSegment / segLen
      arrows.push({
        pos: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
        bearing: segBearing,
      })
      distanceSinceLastArrow = 0
    }
    distanceSinceLastArrow += segLen - coveredInSegment
  }

  return arrows
}

function makeLiveMarkerIcon(isFocused: boolean): L.DivIcon {
  const coreColor = isFocused ? '#00e676' : '#3b82f6'
  const pulseColor = isFocused ? 'rgba(0, 230, 118, 0.45)' : 'rgba(59, 130, 246, 0.45)'
  return L.divIcon({
    html: `<div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
      <div style="position:absolute;width:28px;height:28px;border-radius:50%;background:${pulseColor};animation:livePulse 1.6s ease-out infinite;"></div>
      <div style="width:14px;height:14px;border-radius:50%;background:${coreColor};border:2.5px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.6);z-index:2;"></div>
    </div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

type FlyTarget = { lat: number; lng: number; id: number }

type Props = {
  onMapClick?: (lat: number, lng: number) => void
  focusedDeviceId?: string | null
  selectedPoint?: LatLng | null
  livePositions?: Record<string, LatLng>
  overlays?: Record<string, MapOverlay>
  flyTo?: FlyTarget | null
  children?: ReactNode
}

export function MapView({ onMapClick, focusedDeviceId, selectedPoint, livePositions, overlays, flyTo, children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const liveMarkersRef = useRef<Map<string, L.Marker>>(new Map())
  const overlayMarkersRef = useRef<Map<string, L.Marker>>(new Map())
  const overlayPathCasingsRef = useRef<Map<string, L.Polyline>>(new Map())
  const overlayPathsRef = useRef<Map<string, L.Polyline>>(new Map())
  const overlayArrowsRef = useRef<Map<string, L.Marker[]>>(new Map())
  const overlayCirclesRef = useRef<Map<string, L.Circle>>(new Map())
  const onMapClickRef = useRef(onMapClick)
  onMapClickRef.current = onMapClick

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current).setView(DEFAULT_CENTER, DEFAULT_ZOOM)
    mapRef.current = map

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    // Dedicated panes so route casing/line, direction arrows, and waypoint badges always
    // stack in this exact order regardless of add/remove timing (default markerPane would
    // otherwise let whichever marker type was added most recently paint on top).
    map.createPane('routeLinePane').style.zIndex = '410'
    map.createPane('routeArrowPane').style.zIndex = '420'
    map.createPane('livePositionPane').style.zIndex = '650'

    map.on('click', (e: L.LeafletMouseEvent) => {
      const wrapped = e.latlng.wrap()
      const { lat, lng } = wrapped
      onMapClickRef.current?.(lat, lng)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const liveMarkers = liveMarkersRef.current
    const nextUdids = new Set(Object.keys(livePositions ?? {}))

    for (const [udid, marker] of liveMarkers) {
      if (!nextUdids.has(udid)) {
        marker.remove()
        liveMarkers.delete(udid)
      }
    }

    for (const [udid, pos] of Object.entries(livePositions ?? {})) {
      const isFocused = udid === focusedDeviceId
      const existing = liveMarkers.get(udid)
      if (existing) {
        existing.setLatLng(pos)
        existing.setIcon(makeLiveMarkerIcon(isFocused))
      } else {
        liveMarkers.set(
          udid,
          L.marker(pos, {
            icon: makeLiveMarkerIcon(isFocused),
            pane: 'livePositionPane',
            interactive: false,
          }).addTo(map)
        )
      }
    }
  }, [livePositions, focusedDeviceId])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const markers = overlayMarkersRef.current
    const casings = overlayPathCasingsRef.current
    const paths = overlayPathsRef.current
    const arrows = overlayArrowsRef.current
    const circles = overlayCirclesRef.current

    const nextMarkerIds = new Set<string>()
    const nextPathUdids = new Set<string>()
    const nextCircleUdids = new Set<string>()

    for (const [udid, overlay] of Object.entries(overlays ?? {})) {
      // Draw the path + direction arrows first, then the numbered waypoint badges on top,
      // so the thick route line never covers the badges that show trip progress.
      if (overlay.path.length >= 2) {
        nextPathUdids.add(udid)
        const latlngs = overlay.path.map((p) => [p.lat, p.lng] as [number, number])

        const existingCasing = casings.get(udid)
        if (existingCasing) {
          existingCasing.setLatLngs(latlngs)
        } else {
          casings.set(
            udid,
            L.polyline(latlngs, {
              pane: 'routeLinePane',
              color: '#1c2451',
              weight: 12,
              opacity: 0.55,
              lineCap: 'round',
              lineJoin: 'round',
            }).addTo(map)
          )
        }

        const existing = paths.get(udid)
        if (existing) {
          existing.setLatLngs(latlngs)
        } else {
          paths.set(
            udid,
            L.polyline(latlngs, {
              pane: 'routeLinePane',
              color: '#5b6bff',
              weight: 8,
              opacity: 0.95,
              lineCap: 'round',
              lineJoin: 'round',
            }).addTo(map)
          )
        }

        arrows.get(udid)?.forEach((marker) => marker.remove())
        arrows.set(
          udid,
          sampleArrowPoints(overlay.path).map(({ pos, bearing }) =>
            L.marker([pos.lat, pos.lng], { icon: makeArrowIcon(bearing), interactive: false, pane: 'routeArrowPane' }).addTo(map)
          )
        )
      }

      for (const m of overlay.markers) {
        const id = `${udid}:${m.id}`
        nextMarkerIds.add(id)
        const isDraggable = m.draggable ?? (m.onDragEnd !== undefined)
        let existing = markers.get(id)

        if (existing) {
          existing.setLatLng([m.lat, m.lng])
          existing.setIcon(makeBadgeIcon(m.color, m.label, isDraggable))
          if (isDraggable) {
            existing.dragging?.enable()
          } else {
            existing.dragging?.disable()
          }
        } else {
          existing = L.marker([m.lat, m.lng], {
            icon: makeBadgeIcon(m.color, m.label, isDraggable),
            draggable: isDraggable,
          }).addTo(map)
          markers.set(id, existing)
        }

        existing.off('dragend')
        if (m.onDragEnd) {
          const onDragEnd = m.onDragEnd
          existing.on('dragend', (e: L.LeafletEvent) => {
            const ll = (e.target as L.Marker).getLatLng().wrap()
            onDragEnd(ll.lat, ll.lng)
          })
        }
      }

      if (overlay.circle) {
        nextCircleUdids.add(udid)
        const { lat, lng, radiusMeters } = overlay.circle
        const existing = circles.get(udid)
        if (existing) {
          existing.setLatLng([lat, lng])
          existing.setRadius(radiusMeters)
        } else {
          circles.set(
            udid,
            L.circle([lat, lng], { radius: radiusMeters, color: '#4a9af0', fillColor: '#4a9af0', fillOpacity: 0.1, weight: 2 }).addTo(
              map
            )
          )
        }
      }
    }

    for (const [id, marker] of markers) {
      if (!nextMarkerIds.has(id)) {
        marker.remove()
        markers.delete(id)
      }
    }
    for (const [udid, path] of paths) {
      if (!nextPathUdids.has(udid)) {
        path.remove()
        paths.delete(udid)
        casings.get(udid)?.remove()
        casings.delete(udid)
        arrows.get(udid)?.forEach((marker) => marker.remove())
        arrows.delete(udid)
      }
    }
    for (const [udid, circle] of circles) {
      if (!nextCircleUdids.has(udid)) {
        circle.remove()
        circles.delete(udid)
      }
    }
  }, [overlays])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !flyTo) return
    map.flyTo([flyTo.lat, flyTo.lng], Math.max(map.getZoom(), 14))
  }, [flyTo])

  return (
    <div className="map-view-wrapper">
      <div ref={containerRef} className="map-view" />
      {children}
    </div>
  )
}
