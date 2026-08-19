import { useEffect, useRef, useState, type ReactNode } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapOverlay } from '../panels/types'

import { createCachedTileLayer } from './CachedTileLayer'
import { DEFAULT_TILE_PROVIDER, type TileProviderConfig } from '../../types/tileProvider'
import { API_BASE_URL } from '../../services/api'

const DEFAULT_CENTER: [number, number] = [25.0330, 121.5654]
const DEFAULT_ZOOM = 13

type LatLng = { lat: number; lng: number }
type MapViewport = { lat: number; lng: number; zoom: number }

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

type PathSample = { point: LatLng; bearing: number }

function samplePathAtProgress(path: LatLng[], segmentEnds: number[], totalLength: number, progress: number): PathSample {
  const targetDistance = totalLength * progress
  let low = 0
  let high = segmentEnds.length - 1
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (segmentEnds[middle] < targetDistance) low = middle + 1
    else high = middle
  }
  const index = low
  const previousEnd = index > 0 ? segmentEnds[index - 1] : 0
  const length = segmentEnds[index] - previousEnd
  const fraction = length > 0 ? (targetDistance - previousEnd) / length : 0
  const start = path[index]
  const end = path[index + 1]
  return {
    point: {
      lat: start.lat + (end.lat - start.lat) * fraction,
      lng: start.lng + (end.lng - start.lng) * fraction,
    },
    bearing: bearingDegrees(start, end),
  }
}

function activeLegFromDrawnPath(path: LatLng[], requestedPath: LatLng[] | null | undefined): LatLng[] | null {
  if (path.length < 2 || !requestedPath || requestedPath.length < 2) return requestedPath ?? null

  const closestIndex = (target: LatLng, from: number) => {
    let closest = from
    let closestDistance = Infinity
    for (let index = from; index < path.length; index++) {
      const distance = haversineMeters(path[index], target)
      if (distance < closestDistance) {
        closest = index
        closestDistance = distance
      }
    }
    return closest
  }

  const startIndex = closestIndex(requestedPath[0], 0)
  const endIndex = closestIndex(requestedPath[requestedPath.length - 1], startIndex)
  return endIndex > startIndex ? path.slice(startIndex, endIndex + 1) : requestedPath
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

function makeSelectedPointIcon(): L.DivIcon {
  return L.divIcon({
    html: `<div style="position:relative;width:30px;height:38px;filter:drop-shadow(0 3px 4px rgba(0,0,0,0.55));">
      <div style="position:absolute;left:3px;top:1px;width:24px;height:24px;background:#ff5e36;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-sizing:border-box;"></div>
      <div style="position:absolute;left:12px;top:10px;width:6px;height:6px;background:#fff;border-radius:50%;"></div>
    </div>`,
    className: '',
    iconSize: [30, 38],
    iconAnchor: [15, 35],
  })
}

type FlyTarget = { lat: number; lng: number; id: number }

type Props = {
  onMapClick?: (lat: number, lng: number) => void
  focusedDeviceId?: string | null
  selectedPoint?: LatLng | null
  onSelectedPointDragEnd?: (lat: number, lng: number) => void
  livePositions?: Record<string, LatLng>
  overlays?: Record<string, MapOverlay>
  flyTo?: FlyTarget | null
  tileProvider?: TileProviderConfig
  initialViewport?: MapViewport | null
  onViewportChange?: (viewport: MapViewport) => void
  children?: ReactNode
}

export function LeafletMapView({
  onMapClick,
  focusedDeviceId,
  selectedPoint,
  onSelectedPointDragEnd,
  livePositions,
  overlays,
  flyTo,
  tileProvider,
  initialViewport,
  onViewportChange,
  children,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const [isTileLoading, setIsTileLoading] = useState(false)
  const selectedPointMarkerRef = useRef<L.Marker | null>(null)
  const liveMarkersRef = useRef<Map<string, L.Marker>>(new Map())
  const overlayMarkersRef = useRef<Map<string, L.Marker>>(new Map())
  const overlayMarkerIconKeysRef = useRef<Map<string, string>>(new Map())
  const draggingMarkerIdsRef = useRef<Set<string>>(new Set())
  const draggingOverlayIdsRef = useRef<Set<string>>(new Set())
  const overlayPathCasingsRef = useRef<Map<string, L.Polyline>>(new Map())
  const overlayPathsRef = useRef<Map<string, L.Polyline>>(new Map())
  const overlayArrowsRef = useRef<Map<string, L.Marker[]>>(new Map())
  const overlayActivePathsRef = useRef<Map<string, L.Polyline>>(new Map())
  const overlayActivePathKeysRef = useRef<Map<string, string>>(new Map())
  const arrowAnimationFramesRef = useRef<Map<string, number>>(new Map())
  const overlayCirclesRef = useRef<Map<string, L.Circle>>(new Map())
  const overlaysRef = useRef(overlays)
  overlaysRef.current = overlays
  const focusedDeviceIdRef = useRef(focusedDeviceId)
  focusedDeviceIdRef.current = focusedDeviceId
  const overlayMarkerCallbacksRef = useRef<Map<string, (e: { lat: number; lng: number; clientX: number; clientY: number }) => void>>(new Map())
  const overlayDragCallbacksRef = useRef<Map<string, (lat: number, lng: number) => void>>(new Map())
  const overlayDragEndCallbacksRef = useRef<Map<string, (lat: number, lng: number, rollback?: () => void) => void>>(new Map())

  const onSelectedPointDragEndRef = useRef(onSelectedPointDragEnd)
  onSelectedPointDragEndRef.current = onSelectedPointDragEnd
  const isDraggingSelectedPointRef = useRef(false)
  const onMapClickRef = useRef(onMapClick)
  onMapClickRef.current = onMapClick
  const initialViewportRef = useRef(initialViewport)
  const onViewportChangeRef = useRef(onViewportChange)
  onViewportChangeRef.current = onViewportChange

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const viewport = initialViewportRef.current
    const map = L.map(containerRef.current).setView(
      viewport ? [viewport.lat, viewport.lng] : DEFAULT_CENTER,
      viewport?.zoom ?? DEFAULT_ZOOM
    )
    mapRef.current = map

    map.createPane('routeLinePane').style.zIndex = '410'
    map.createPane('routeArrowPane').style.zIndex = '420'
    map.createPane('selectedPointPane').style.zIndex = '625'
    map.createPane('livePositionPane').style.zIndex = '650'

    map.on('click', (e: L.LeafletMouseEvent) => {
      const wrapped = e.latlng.wrap()
      const { lat, lng } = wrapped
      onMapClickRef.current?.(lat, lng)
    })

    map.on('contextmenu', (e: L.LeafletMouseEvent) => {
      e.originalEvent.preventDefault()
      const wrapped = e.latlng.wrap()
      const focusedId = focusedDeviceIdRef.current
      const currentOverlays = overlaysRef.current ?? {}
      const targetOverlay = (focusedId && currentOverlays[focusedId]) || Object.values(currentOverlays)[0]
      targetOverlay?.onMapContextMenu?.({
        lat: wrapped.lat,
        lng: wrapped.lng,
        clientX: e.originalEvent.clientX,
        clientY: e.originalEvent.clientY,
      })
    })

    map.on('moveend', () => {
      const center = map.getCenter()
      onViewportChangeRef.current?.({ lat: center.lat, lng: center.lng, zoom: map.getZoom() })
    })

    return () => {
      for (const frameId of arrowAnimationFramesRef.current.values()) {
        cancelAnimationFrame(frameId)
      }
      arrowAnimationFramesRef.current.clear()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Dynamically attach and hot-swap tileLayer when tileProvider changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (tileLayerRef.current) {
      tileLayerRef.current.remove()
      tileLayerRef.current = null
    }

    const provider = tileProvider ?? DEFAULT_TILE_PROVIDER
    // All environments (desktop + mobile) route default OSM tiles through the
    // backend proxy which sets the required User-Agent header.  The mobile page
    // reaches the same server via API_BASE_URL = window.location.origin, so the
    // proxy path works identically.  Direct requests to tile.openstreetmap.org
    // are blocked (403) when the client lacks a valid Referer / User-Agent.
    const tileUrl =
      provider.id === DEFAULT_TILE_PROVIDER.id
        ? `${API_BASE_URL}/api/map/tiles/{z}/{x}/{y}.png`
        : provider.url

    const tileLayer = createCachedTileLayer(tileUrl, {
      provider,
      attribution: provider.attribution,
      maxZoom: provider.maxZoom,
      subdomains: provider.subdomains ?? 'abc',
      updateWhenZooming: false,
      updateWhenIdle: true,
      keepBuffer: 2,
    }).addTo(map)

    tileLayer.on('loading', () => setIsTileLoading(true))
    tileLayer.on('load', () => setIsTileLoading(false))
    tileLayer.on('tileerror', () => setIsTileLoading(false))

    tileLayerRef.current = tileLayer

    return () => {
      tileLayer.remove()
      tileLayerRef.current = null
    }
  }, [tileProvider])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!selectedPoint) {
      selectedPointMarkerRef.current?.remove()
      selectedPointMarkerRef.current = null
      return
    }

    let marker = selectedPointMarkerRef.current
    if (marker) {
      if (!isDraggingSelectedPointRef.current) {
        marker.setLatLng([selectedPoint.lat, selectedPoint.lng])
      }
    } else {
      marker = L.marker([selectedPoint.lat, selectedPoint.lng], {
        icon: makeSelectedPointIcon(),
        draggable: true,
        zIndexOffset: 1000,
        pane: 'selectedPointPane',
      }).addTo(map)

      marker.on('dragstart', () => {
        isDraggingSelectedPointRef.current = true
      })

      marker.on('dragend', () => {
        isDraggingSelectedPointRef.current = false
        const { lat, lng } = marker!.getLatLng()
        onSelectedPointDragEndRef.current?.(lat, lng)
      })

      selectedPointMarkerRef.current = marker
    }
  }, [selectedPoint])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const currentPositions = livePositions ?? {}
    const activeIds = new Set(Object.keys(currentPositions))

    for (const [id, marker] of liveMarkersRef.current.entries()) {
      if (!activeIds.has(id)) {
        marker.remove()
        liveMarkersRef.current.delete(id)
      }
    }

    for (const [id, pos] of Object.entries(currentPositions)) {
      const isFocused = id === focusedDeviceId
      let marker = liveMarkersRef.current.get(id)
      if (!marker) {
        marker = L.marker([pos.lat, pos.lng], {
          icon: makeLiveMarkerIcon(isFocused),
          zIndexOffset: isFocused ? 1100 : 900,
          interactive: false,
          pane: 'livePositionPane',
        }).addTo(map)
        liveMarkersRef.current.set(id, marker)
      } else {
        marker.setLatLng([pos.lat, pos.lng])
        marker.setIcon(makeLiveMarkerIcon(isFocused))
        marker.setZIndexOffset(isFocused ? 1100 : 900)
      }
    }
  }, [livePositions, focusedDeviceId])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const activeOverlays = overlays ?? {}
    const activeOverlayIds = new Set(Object.keys(activeOverlays))
    const currentMarkerKeys = new Set<string>()

    for (const [deviceId, overlay] of Object.entries(activeOverlays)) {
      if (overlay.markers) {
        overlay.markers.forEach((m, idx) => {
          const key = `${deviceId}-${idx}`
          currentMarkerKeys.add(key)
          if (m.onContextMenu) {
            overlayMarkerCallbacksRef.current.set(key, m.onContextMenu)
          } else {
            overlayMarkerCallbacksRef.current.delete(key)
          }
          if (m.onDrag) {
            overlayDragCallbacksRef.current.set(key, m.onDrag)
          } else {
            overlayDragCallbacksRef.current.delete(key)
          }
          if (m.onDragEnd) {
            overlayDragEndCallbacksRef.current.set(key, m.onDragEnd)
          } else {
            overlayDragEndCallbacksRef.current.delete(key)
          }

          const iconKey = `${m.color ?? ''}|${m.label ?? ''}|${m.draggable ?? false}`
          let marker = overlayMarkersRef.current.get(key)
          if (!marker) {
            marker = L.marker([m.lat, m.lng], {
              icon: makeBadgeIcon(m.color || '#ff5e36', m.label, m.draggable),
              draggable: Boolean(m.draggable),
            }).addTo(map)
            marker.on('contextmenu', (e: L.LeafletMouseEvent) => {
              L.DomEvent.stopPropagation(e)
              e.originalEvent.preventDefault()
              const cb = overlayMarkerCallbacksRef.current.get(key)
              cb?.({
                lat: m.lat,
                lng: m.lng,
                clientX: e.originalEvent.clientX,
                clientY: e.originalEvent.clientY,
              })
            })
            if (m.draggable) {
              let originalPosition: L.LatLng | null = null
              marker.on('dragstart', () => {
                draggingMarkerIdsRef.current.add(key)
                draggingOverlayIdsRef.current.add(key)
                originalPosition = marker!.getLatLng()
                overlayArrowsRef.current.get(deviceId)?.forEach((arrow) => arrow.setOpacity(0))
              })
              marker.on('drag', () => {
                const { lat, lng } = marker!.getLatLng()
                if (m.pathIndex !== undefined && overlay.path.length >= 2) {
                  const isClosedLoop =
                    overlay.path.length >= 3 &&
                    overlay.path[0].lat === overlay.path[overlay.path.length - 1].lat &&
                    overlay.path[0].lng === overlay.path[overlay.path.length - 1].lng
                  const previewPath = overlay.path.map((point, index) => {
                    if (index === m.pathIndex || (isClosedLoop && m.pathIndex === 0 && index === overlay.path.length - 1)) {
                      return [lat, lng] as [number, number]
                    }
                    return [point.lat, point.lng] as [number, number]
                  })
                  overlayPathCasingsRef.current.get(deviceId)?.setLatLngs(previewPath)
                  overlayPathsRef.current.get(deviceId)?.setLatLngs(previewPath)
                }
                overlayDragCallbacksRef.current.get(key)?.(lat, lng)
              })
              marker.on('dragend', () => {
                draggingOverlayIdsRef.current.delete(key)
                const { lat, lng } = marker!.getLatLng()
                const rollback = () => {
                  if (!originalPosition) return
                  marker!.setLatLng(originalPosition)
                  if (m.pathIndex !== undefined && overlay.path.length >= 2) {
                    const originalPath = overlay.path.map((point) => [point.lat, point.lng] as [number, number])
                    overlayPathCasingsRef.current.get(deviceId)?.setLatLngs(originalPath)
                    overlayPathsRef.current.get(deviceId)?.setLatLngs(originalPath)
                  }
                }
                overlayDragEndCallbacksRef.current.get(key)?.(lat, lng, rollback)
                requestAnimationFrame(() => {
                  draggingMarkerIdsRef.current.delete(key)
                  overlayArrowsRef.current.get(deviceId)?.forEach((arrow) => arrow.setOpacity(1))
                })
              })
            }
            overlayMarkersRef.current.set(key, marker)
            overlayMarkerIconKeysRef.current.set(key, iconKey)
          } else {
            if (!draggingOverlayIdsRef.current.has(key)) {
              marker.setLatLng([m.lat, m.lng])
            }
            if (overlayMarkerIconKeysRef.current.get(key) !== iconKey) {
              marker.setIcon(makeBadgeIcon(m.color || '#ff5e36', m.label, m.draggable))
              overlayMarkerIconKeysRef.current.set(key, iconKey)
            }
          }
        })
      }
    }

    for (const [key, marker] of overlayMarkersRef.current.entries()) {
      if (!currentMarkerKeys.has(key)) {
        marker.remove()
        overlayMarkersRef.current.delete(key)
        overlayMarkerIconKeysRef.current.delete(key)
        overlayMarkerCallbacksRef.current.delete(key)
        overlayDragCallbacksRef.current.delete(key)
        overlayDragEndCallbacksRef.current.delete(key)
      }
    }

    for (const [deviceId, casing] of overlayPathCasingsRef.current.entries()) {
      if (!activeOverlayIds.has(deviceId)) {
        casing.remove()
        overlayPathCasingsRef.current.delete(deviceId)
      }
    }

    for (const [deviceId, polyline] of overlayPathsRef.current.entries()) {
      if (!activeOverlayIds.has(deviceId)) {
        polyline.remove()
        overlayPathsRef.current.delete(deviceId)
      }
    }

    for (const [deviceId, arrows] of overlayArrowsRef.current.entries()) {
      if (!activeOverlayIds.has(deviceId)) {
        arrows.forEach((a) => a.remove())
        overlayArrowsRef.current.delete(deviceId)
      }
    }

    for (const [deviceId, circle] of overlayCirclesRef.current.entries()) {
      if (!activeOverlayIds.has(deviceId)) {
        circle.remove()
        overlayCirclesRef.current.delete(deviceId)
      }
    }

    for (const [deviceId, activePath] of overlayActivePathsRef.current.entries()) {
      if (!activeOverlayIds.has(deviceId)) {
        activePath.remove()
        overlayActivePathsRef.current.delete(deviceId)
        overlayActivePathKeysRef.current.delete(deviceId)
      }
    }

    for (const [deviceId, frameId] of arrowAnimationFramesRef.current.entries()) {
      if (!activeOverlayIds.has(deviceId)) {
        cancelAnimationFrame(frameId)
        arrowAnimationFramesRef.current.delete(deviceId)
      }
    }

    for (const [deviceId, overlay] of Object.entries(activeOverlays)) {
      if (overlay.path && overlay.path.length >= 2) {
        const latLngs = overlay.path.map((p) => [p.lat, p.lng] as [number, number])
        let casing = overlayPathCasingsRef.current.get(deviceId)
        if (!casing) {
          casing = L.polyline(latLngs, {
            color: '#1c2451',
            weight: 12,
            opacity: 0.55,
            pane: 'routeLinePane',
          }).addTo(map)
          overlayPathCasingsRef.current.set(deviceId, casing)
        } else {
          casing.setLatLngs(latLngs)
        }

        let polyline = overlayPathsRef.current.get(deviceId)
        if (!polyline) {
          polyline = L.polyline(latLngs, {
            color: '#5b6bff',
            weight: 8,
            opacity: 0.95,
            pane: 'routeLinePane',
          }).addTo(map)
          overlayPathsRef.current.set(deviceId, polyline)
        } else {
          polyline.setLatLngs(latLngs)
        }

        const drawnPath = overlay.path
        const activePathSource = activeLegFromDrawnPath(drawnPath, overlay.activePath)
        if (activePathSource && activePathSource.length >= 2) {
          const activeLatLngs = activePathSource.map((p) => [p.lat, p.lng] as [number, number])
          const activeKey = activePathSource.map((p) => `${p.lat},${p.lng}`).join(';')
          let activePolyline = overlayActivePathsRef.current.get(deviceId)
          if (!activePolyline) {
            activePolyline = L.polyline(activeLatLngs, {
              color: '#93c5fd',
              weight: 10,
              opacity: 0.9,
              pane: 'routeLinePane',
            }).addTo(map)
            overlayActivePathsRef.current.set(deviceId, activePolyline)
            overlayActivePathKeysRef.current.set(deviceId, activeKey)
          } else {
            if (overlayActivePathKeysRef.current.get(deviceId) !== activeKey) {
              activePolyline.setLatLngs(activeLatLngs)
              overlayActivePathKeysRef.current.set(deviceId, activeKey)
            }
          }
        } else {
          const existingActive = overlayActivePathsRef.current.get(deviceId)
          if (existingActive) {
            existingActive.remove()
            overlayActivePathsRef.current.delete(deviceId)
            overlayActivePathKeysRef.current.delete(deviceId)
          }
        }

        const arrowPath = activePathSource && activePathSource.length >= 2 ? activePathSource : overlay.path
        const segmentEnds: number[] = []
        let totalLength = 0
        for (let i = 0; i < arrowPath.length - 1; i++) {
          totalLength += haversineMeters(arrowPath[i], arrowPath[i + 1])
          segmentEnds.push(totalLength)
        }

        if (totalLength >= 40) {
          const arrowCount = Math.max(1, Math.floor(totalLength / ARROW_SPACING_METERS))
          const existingArrows = overlayArrowsRef.current.get(deviceId) ?? []
          while (existingArrows.length < arrowCount) {
            const arrow = L.marker([0, 0], {
              icon: makeArrowIcon(0),
              interactive: false,
              pane: 'routeArrowPane',
            }).addTo(map)
            existingArrows.push(arrow)
          }
          while (existingArrows.length > arrowCount) {
            existingArrows.pop()!.remove()
          }
          overlayArrowsRef.current.set(deviceId, existingArrows)

          const speedMultiplier = 1 / 4
          const animate = (timestamp: number) => {
            const cycleMs = 2500 / speedMultiplier
            const baseProgress = (timestamp % cycleMs) / cycleMs
            for (let i = 0; i < existingArrows.length; i++) {
              const fraction = (baseProgress + i / arrowCount) % 1
              const sample = samplePathAtProgress(arrowPath, segmentEnds, totalLength, fraction)
              existingArrows[i].setLatLng([sample.point.lat, sample.point.lng])
              existingArrows[i].setIcon(makeArrowIcon(sample.bearing))
            }
            arrowAnimationFramesRef.current.set(deviceId, requestAnimationFrame(animate))
          }

          const currentFrame = arrowAnimationFramesRef.current.get(deviceId)
          if (currentFrame) cancelAnimationFrame(currentFrame)
          arrowAnimationFramesRef.current.set(deviceId, requestAnimationFrame(animate))
        }
      } else {
        overlayPathCasingsRef.current.get(deviceId)?.remove()
        overlayPathCasingsRef.current.delete(deviceId)
        overlayPathsRef.current.get(deviceId)?.remove()
        overlayPathsRef.current.delete(deviceId)
      }

      // An empty overlay is also a valid clear request (panel cleanup publishes
      // one during a mode change).  It must remove arrows even though the device
      // id is still present in the overlay record.
      if (!overlay.path || overlay.path.length < 2) {
        overlayArrowsRef.current.get(deviceId)?.forEach((arrow) => arrow.remove())
        overlayArrowsRef.current.delete(deviceId)
        const frameId = arrowAnimationFramesRef.current.get(deviceId)
        if (frameId) cancelAnimationFrame(frameId)
        arrowAnimationFramesRef.current.delete(deviceId)
      }

      if (overlay.circle) {
        const { lat, lng, radiusMeters } = overlay.circle
        const existingCircle = overlayCirclesRef.current.get(deviceId)
        if (existingCircle) {
          existingCircle.setLatLng([lat, lng])
          existingCircle.setRadius(radiusMeters)
        } else {
          overlayCirclesRef.current.set(
            deviceId,
            L.circle([lat, lng], {
              radius: radiusMeters,
              color: '#4a9af0',
              fillColor: '#4a9af0',
              fillOpacity: 0.1,
              opacity: 1,
              weight: 2,
            }).addTo(map)
          )
        }
      } else {
        overlayCirclesRef.current.get(deviceId)?.remove()
        overlayCirclesRef.current.delete(deviceId)
      }
    }
  }, [overlays])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !flyTo) return

    map.stop()
    const target = L.latLng(flyTo.lat, flyTo.lng)
    const distance = map.getCenter().distanceTo(target)
    const zoom = Math.max(map.getZoom(), 14)

    if (distance > 5_000) {
      map.setView(target, zoom, { animate: false })
    } else {
      map.flyTo(target, zoom, { duration: 0.6 })
    }
  }, [flyTo])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {isTileLoading && (
        <div className="map-tile-loading-badge" role="status" aria-live="polite">
          <span className="map-tile-loading-spinner" />
          載入地圖中...
        </div>
      )}
    </div>
  )
}
