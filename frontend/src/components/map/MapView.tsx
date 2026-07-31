import { useEffect, useRef, type ReactNode } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapOverlay } from '../panels/types'

const DEFAULT_CENTER: [number, number] = [25.0330, 121.5654]
const DEFAULT_ZOOM = 13

type LatLng = { lat: number; lng: number }

function makeBadgeIcon(color: string, label?: string): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:600;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);">${label ?? ''}</div>`,
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

type FlyTarget = { lat: number; lng: number; id: number }

type Props = {
  onMapClick?: (lat: number, lng: number) => void
  livePositions?: Record<string, LatLng>
  overlays?: Record<string, MapOverlay>
  flyTo?: FlyTarget | null
  children?: ReactNode
}

export function MapView({ onMapClick, livePositions, overlays, flyTo, children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const liveMarkersRef = useRef<Map<string, L.CircleMarker>>(new Map())
  const overlayMarkersRef = useRef<Map<string, L.Marker>>(new Map())
  const overlayPathsRef = useRef<Map<string, L.Polyline>>(new Map())
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

    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng
      if (markerRef.current) {
        markerRef.current.setLatLng(e.latlng)
      } else {
        markerRef.current = L.marker(e.latlng).addTo(map)
      }
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
      const existing = liveMarkers.get(udid)
      if (existing) {
        existing.setLatLng(pos)
      } else {
        liveMarkers.set(
          udid,
          L.circleMarker(pos, {
            radius: 8,
            color: '#4a4af0',
            fillColor: '#4a4af0',
            fillOpacity: 0.9,
          }).addTo(map)
        )
      }
    }
  }, [livePositions])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const markers = overlayMarkersRef.current
    const paths = overlayPathsRef.current
    const circles = overlayCirclesRef.current

    const nextMarkerIds = new Set<string>()
    const nextPathUdids = new Set<string>()
    const nextCircleUdids = new Set<string>()

    for (const [udid, overlay] of Object.entries(overlays ?? {})) {
      for (const m of overlay.markers) {
        const id = `${udid}:${m.id}`
        nextMarkerIds.add(id)
        const existing = markers.get(id)
        if (existing) {
          existing.setLatLng([m.lat, m.lng])
          existing.setIcon(makeBadgeIcon(m.color, m.label))
        } else {
          markers.set(id, L.marker([m.lat, m.lng], { icon: makeBadgeIcon(m.color, m.label) }).addTo(map))
        }
      }

      if (overlay.path.length >= 2) {
        nextPathUdids.add(udid)
        const latlngs = overlay.path.map((p) => [p.lat, p.lng] as [number, number])
        const existing = paths.get(udid)
        if (existing) {
          existing.setLatLngs(latlngs)
        } else {
          paths.set(udid, L.polyline(latlngs, { color: '#4a4af0', weight: 3, opacity: 0.7 }).addTo(map))
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
