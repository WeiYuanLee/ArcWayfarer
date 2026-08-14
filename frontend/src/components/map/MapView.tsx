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

/**
 * The animated leg must be a literal slice of the blue route already drawn on
 * the map. `requestedPath` only identifies its start/end waypoint; it is never
 * used as the geometry, so an animation cannot cut across a road-route bend.
 */
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
  children?: ReactNode
}

export function MapView({ onMapClick, focusedDeviceId, selectedPoint, onSelectedPointDragEnd, livePositions, overlays, flyTo, children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
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
  const onMapClickRef = useRef(onMapClick)
  onMapClickRef.current = onMapClick
  const onMapContextMenuRef = useRef<((e: { lat: number; lng: number; clientX: number; clientY: number }) => void) | null>(null)

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
      onMapContextMenuRef.current?.({
        lat: wrapped.lat,
        lng: wrapped.lng,
        clientX: e.originalEvent.clientX,
        clientY: e.originalEvent.clientY,
      })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

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
      marker.setLatLng(selectedPoint)
    } else {
      marker = L.marker(selectedPoint, {
        icon: makeSelectedPointIcon(),
        pane: 'selectedPointPane',
        draggable: Boolean(onSelectedPointDragEnd),
        keyboard: false,
      }).addTo(map)
      selectedPointMarkerRef.current = marker
    }

    marker.off('dragend')
    if (onSelectedPointDragEnd) {
      marker.dragging?.enable()
      marker.on('dragend', (e: L.LeafletEvent) => {
        const ll = (e.target as L.Marker).getLatLng().wrap()
        onSelectedPointDragEnd(ll.lat, ll.lng)
      })
    } else {
      marker.dragging?.disable()
    }
  }, [selectedPoint, onSelectedPointDragEnd])

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
    const markerIconKeys = overlayMarkerIconKeysRef.current
    const casings = overlayPathCasingsRef.current
    const paths = overlayPathsRef.current
    const arrows = overlayArrowsRef.current
    const activePaths = overlayActivePathsRef.current
    const activePathKeys = overlayActivePathKeysRef.current
    const arrowAnimationFrames = arrowAnimationFramesRef.current
    const circles = overlayCirclesRef.current

    const nextMarkerIds = new Set<string>()
    const nextPathUdids = new Set<string>()
    const nextCircleUdids = new Set<string>()

    for (const [udid, overlay] of Object.entries(overlays ?? {})) {
      const isOverlayDragging = draggingOverlayIdsRef.current.has(udid)
      // Draw the path first, then the numbered waypoint badges on top,
      // so the thick route line never covers the badges that show trip progress.
      if (overlay.path.length >= 2) {
        nextPathUdids.add(udid)
        const latlngs = overlay.path.map((p) => [p.lat, p.lng] as [number, number])

        const existingCasing = casings.get(udid)
        if (existingCasing && !isOverlayDragging) {
          existingCasing.setLatLngs(latlngs)
        } else {
          if (!existingCasing) {
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
        }

        const existing = paths.get(udid)
        if (existing && !isOverlayDragging) {
          existing.setLatLngs(latlngs)
        } else {
          if (!existing) {
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
        }

      }

      // Only the leg being travelled receives arrows. Keeping the complete route as a
      // plain blue line makes the current Point N → Point N+1 leg immediately obvious.
      // Derive the highlighted route from `overlay.path`, the same exact array
      // used to draw the blue line above. See activeLegFromDrawnPath().
      const activePath = activeLegFromDrawnPath(overlay.path, overlay.activePath)
      const activePathKey = activePath && activePath.length >= 2 ? activePath.map((point) => `${point.lat},${point.lng}`).join('|') : null
      const activePathChanged = activePathKeys.get(udid) !== activePathKey
      if (activePathChanged) {
        cancelAnimationFrame(arrowAnimationFrames.get(udid) ?? 0)
        arrowAnimationFrames.delete(udid)
        arrows.get(udid)?.forEach((marker) => marker.remove())
        arrows.delete(udid)
        activePaths.get(udid)?.remove()
        activePaths.delete(udid)
        activePathKeys.delete(udid)
      }

      if (!isOverlayDragging && activePath && activePath.length >= 2 && activePathChanged) {
        const activeLatLngs = activePath.map((p) => [p.lat, p.lng] as [number, number])
        activePaths.set(
          udid,
          L.polyline(activeLatLngs, {
            pane: 'routeLinePane',
            color: '#93c5fd',
            weight: 10,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(map)
        )
        activePathKeys.set(udid, activePathKey!)

        const segmentLengths = activePath.slice(1).map((point, index) => haversineMeters(activePath[index], point))
        const segmentEnds = segmentLengths.reduce<number[]>((ends, length) => {
          ends.push((ends.at(-1) ?? 0) + length)
          return ends
        }, [])
        const pathLength = segmentEnds.at(-1) ?? 0
        const arrowCount = Math.max(1, Math.ceil(pathLength / ARROW_SPACING_METERS))
        const activeArrows = Array.from({ length: arrowCount }, () =>
          L.marker(activeLatLngs[0], { icon: makeArrowIcon(0), interactive: false, pane: 'routeArrowPane' }).addTo(map)
        )
        arrows.set(udid, activeArrows)

        const animateArrows = (now: number) => {
          const phase = (now % 1600) / 1600
          activeArrows.forEach((arrow, index) => {
            const progress = (phase + index / arrowCount) % 1
            const sample = samplePathAtProgress(activePath, segmentEnds, pathLength, progress)
            arrow.setLatLng(sample.point)
            arrow.setIcon(makeArrowIcon(sample.bearing))
          })
          arrowAnimationFrames.set(udid, requestAnimationFrame(animateArrows))
        }
        arrowAnimationFrames.set(udid, requestAnimationFrame(animateArrows))
      }

      for (const m of overlay.markers) {
        const id = `${udid}:${m.id}`
        nextMarkerIds.add(id)
        // React may publish an otherwise unchanged overlay while a Leaflet drag is in
        // progress (for example after a live-position update). Do not let that stale
        // model coordinate snap the marker back or replace its active drag listeners.
        if (draggingMarkerIdsRef.current.has(id) && markers.has(id)) continue
        const isDraggable = m.draggable ?? (m.onDragEnd !== undefined)
        const iconKey = `${m.color}\u0000${m.label ?? ''}\u0000${isDraggable ? 'draggable' : 'fixed'}`
        let existing = markers.get(id)

        // Leaflet's MarkerDrag keeps a reference to the icon DOM node that existed when
        // dragging was first enabled. Calling setIcon() replaces that node, but toggling
        // dragging does not update the internal reference. Recreate the marker only when
        // its icon actually changes; ordinary overlay/path updates must preserve its DOM.
        if (existing && markerIconKeys.get(id) !== iconKey) {
          existing.remove()
          markers.delete(id)
          existing = undefined
        }

        if (existing) {
          existing.setLatLng([m.lat, m.lng])
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
          markerIconKeys.set(id, iconKey)
        }

        existing.off('dragstart')
        existing.off('drag')
        existing.off('dragend')
        existing.off('contextmenu')

        if (m.pathIndex !== undefined && overlay.path.length >= 2) {
          const pathIndex = m.pathIndex
          const path = overlay.path
          const isClosedLoop =
            path.length >= 3 &&
            path[0].lat === path[path.length - 1].lat &&
            path[0].lng === path[path.length - 1].lng

          let dragLatest: { lat: number; lng: number } | null = null
          let dragRafId: number | null = null
          let originalLatLng: L.LatLng | null = null

          const applyDragPosition = ({ lat, lng }: LatLng) => {
            const newLatLngs: [number, number][] = path.map((p, j) => {
              if (j === pathIndex) return [lat, lng]
              if (isClosedLoop && j === path.length - 1 && pathIndex === 0) return [lat, lng]
              return [p.lat, p.lng]
            })
            casings.get(udid)?.setLatLngs(newLatLngs)
            paths.get(udid)?.setLatLngs(newLatLngs)
          }

          existing.on('dragstart', () => {
            draggingMarkerIdsRef.current.add(id)
            draggingOverlayIdsRef.current.add(udid)
            originalLatLng = existing!.getLatLng()
            dragLatest = null
            dragRafId = null
            arrows.get(udid)?.forEach((a) => a.setOpacity(0))
          })

          existing.on('drag', (e: L.LeafletEvent) => {
            const ll = (e.target as L.Marker).getLatLng().wrap()
            dragLatest = { lat: ll.lat, lng: ll.lng }
            if (dragRafId !== null) return
            dragRafId = requestAnimationFrame(() => {
              dragRafId = null
              if (!dragLatest) return
              applyDragPosition(dragLatest)
            })
          })

          existing.on('dragend', (e: L.LeafletEvent) => {
            if (dragRafId !== null) {
              cancelAnimationFrame(dragRafId)
              dragRafId = null
            }
            const ll = (e.target as L.Marker).getLatLng().wrap()
            const finalPosition = { lat: ll.lat, lng: ll.lng }
            // Commit the final preview before React receives the coordinate. Keep the
            // drag guard through the next frame so an intermediate overlay containing
            // the new marker but the previous route cannot flash on screen.
            applyDragPosition(finalPosition)
            dragLatest = null
            const orig = originalLatLng
            const rollback = () => {
              if (!orig) return
              existing!.setLatLng(orig)
              const casingPoly = casings.get(udid)
              const pathPoly = paths.get(udid)
              if (casingPoly && pathPoly) {
                const lls = casingPoly.getLatLngs() as L.LatLng[]
                lls[pathIndex] = orig
                if (isClosedLoop && pathIndex === 0) lls[path.length - 1] = orig
                casingPoly.setLatLngs(lls)
                pathPoly.setLatLngs(lls)
              }
            }
            m.onDragEnd?.(finalPosition.lat, finalPosition.lng, rollback)
            requestAnimationFrame(() => {
              draggingMarkerIdsRef.current.delete(id)
              draggingOverlayIdsRef.current.delete(udid)
              arrows.get(udid)?.forEach((a) => a.setOpacity(1))
            })
          })
        } else {
          if (m.onDrag) {
            const onDrag = m.onDrag
            existing.on('drag', (e: L.LeafletEvent) => {
              const ll = (e.target as L.Marker).getLatLng().wrap()
              onDrag(ll.lat, ll.lng)
            })
          }
          if (m.onDragEnd) {
            const onDragEnd = m.onDragEnd
            existing.on('dragend', (e: L.LeafletEvent) => {
              const ll = (e.target as L.Marker).getLatLng().wrap()
              onDragEnd(ll.lat, ll.lng)
            })
          }
        }

        if (m.onContextMenu && udid === focusedDeviceId) {
          const onContextMenu = m.onContextMenu
          existing.on('contextmenu', (e: L.LeafletMouseEvent) => {
            e.originalEvent.preventDefault()
            e.originalEvent.stopPropagation()
            const ll = e.latlng.wrap()
            onContextMenu({ lat: ll.lat, lng: ll.lng, clientX: e.originalEvent.clientX, clientY: e.originalEvent.clientY })
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
        markerIconKeys.delete(id)
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
        cancelAnimationFrame(arrowAnimationFrames.get(udid) ?? 0)
        arrowAnimationFrames.delete(udid)
        activePaths.get(udid)?.remove()
        activePaths.delete(udid)
        activePathKeys.delete(udid)
      }
    }
    for (const [udid, circle] of circles) {
      if (!nextCircleUdids.has(udid)) {
        circle.remove()
        circles.delete(udid)
      }
    }

    // Only the focused device may react to a map right-click. Multiple device overlays
    // can be visible at once, so selecting the last handler would target the wrong mode.
    onMapContextMenuRef.current = focusedDeviceId
      ? overlays?.[focusedDeviceId]?.onMapContextMenu ?? null
      : null
  }, [overlays, focusedDeviceId])

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
