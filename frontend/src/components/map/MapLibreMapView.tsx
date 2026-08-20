import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  NavigationControl,
  AttributionControl,
  type GeoJSONSource,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { MapOverlay } from '../panels/types'
import { DEFAULT_TILE_PROVIDER, type TileProviderConfig } from '../../types/tileProvider'
import { API_BASE_URL } from '../../services/api'

const DEFAULT_CENTER: [number, number] = [25.0330, 121.5654]
const DEFAULT_ZOOM = 13
const EARTH_RADIUS_M = 6371000
const ARROW_SPACING_METERS = 180
const EMPTY_LINE_FEATURE_COLLECTION: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: 'FeatureCollection',
  features: [],
}

type LatLng = { lat: number; lng: number }
type FlyTarget = { lat: number; lng: number; id: number }
type MapViewport = { lat: number; lng: number; zoom: number }

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

function bearingDegrees(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const dLng = toRad(b.lng - a.lng)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function samplePathAtProgress(path: LatLng[], segmentEnds: number[], totalLength: number, progress: number) {
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

function createCircleGeoJSON(center: LatLng, radiusMeters: number, points = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = []
  const latR = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI)
  const lngR = latR / Math.cos((center.lat * Math.PI) / 180)
  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * (2 * Math.PI)
    coords.push([center.lng + lngR * Math.sin(theta), center.lat + latR * Math.cos(theta)])
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [coords],
    },
  }
}

function makeBadgeElement(
  color: string,
  label?: string,
  onContextMenu?: (e: { lat: number; lng: number; clientX: number; clientY: number }) => void,
  coords?: LatLng,
  isDraggable?: boolean
): HTMLElement {
  const el = document.createElement('div')
  el.style.width = '22px'
  el.style.height = '22px'
  el.style.borderRadius = '50%'
  el.style.backgroundColor = color
  el.style.display = 'flex'
  el.style.alignItems = 'center'
  el.style.justifyContent = 'center'
  el.style.color = '#ffffff'
  el.style.fontSize = '11px'
  el.style.fontWeight = '600'
  el.style.border = '2px solid #ffffff'
  el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)'
  el.style.cursor = isDraggable ? 'grab' : 'default'
  el.style.zIndex = '1000'
  el.textContent = label ?? ''

  if (onContextMenu && coords) {
    el.addEventListener('contextmenu', (e) => {
      e.stopPropagation()
      e.preventDefault()
      onContextMenu({
        lat: coords.lat,
        lng: coords.lng,
        clientX: e.clientX,
        clientY: e.clientY,
      })
    })
  }
  return el
}

function updateBadgeElement(element: HTMLElement, color: string, label: string | undefined, isDraggable: boolean) {
  element.style.backgroundColor = color
  element.style.cursor = isDraggable ? 'grab' : 'default'
  element.textContent = label ?? ''
}

function makeLiveMarkerElement(isFocused: boolean): HTMLElement {
  const coreColor = isFocused ? '#00e676' : '#3b82f6'
  const pulseColor = isFocused ? 'rgba(0, 230, 118, 0.45)' : 'rgba(59, 130, 246, 0.45)'
  const wrapper = document.createElement('div')
  wrapper.classList.add('arcwayfarer-live-position-marker')
  wrapper.style.width = '28px'
  wrapper.style.height = '28px'
  wrapper.style.display = 'flex'
  wrapper.style.alignItems = 'center'
  wrapper.style.justifyContent = 'center'
  wrapper.innerHTML = `
    <div style="position:absolute;width:28px;height:28px;border-radius:50%;background:${pulseColor};animation:livePulse 1.6s ease-out infinite;"></div>
    <div style="width:14px;height:14px;border-radius:50%;background:${coreColor};border:2.5px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.6);z-index:2;"></div>
  `
  return wrapper
}

function updateLiveMarkerElement(element: HTMLElement, isFocused: boolean) {
  const coreColor = isFocused ? '#00e676' : '#3b82f6'
  const pulseColor = isFocused ? 'rgba(0, 230, 118, 0.45)' : 'rgba(59, 130, 246, 0.45)'
  element.style.zIndex = isFocused ? '1100' : '900'
  const [pulse, core] = Array.from(element.children) as HTMLElement[]
  if (pulse) pulse.style.background = pulseColor
  if (core) core.style.background = coreColor
}

function makeSelectedPointElement(): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.classList.add('arcwayfarer-selected-point-marker')
  wrapper.style.width = '30px'
  wrapper.style.height = '38px'
  wrapper.style.cursor = 'grab'
  wrapper.style.zIndex = '1000'
  wrapper.style.filter = 'drop-shadow(0 3px 4px rgba(0,0,0,0.55))'
  wrapper.innerHTML = `
    <div style="position:absolute;left:3px;top:1px;width:24px;height:24px;background:#ff5e36;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-sizing:border-box;"></div>
    <div style="position:absolute;left:12px;top:10px;width:6px;height:6px;background:#fff;border-radius:50%;"></div>
  `
  return wrapper
}

function makeArrowElement(): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.style.width = '14px'
  wrapper.style.height = '14px'
  wrapper.style.display = 'flex'
  wrapper.style.alignItems = 'center'
  wrapper.style.justifyContent = 'center'
  wrapper.style.pointerEvents = 'none'
  wrapper.style.zIndex = '3'
  wrapper.innerHTML = '<div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:8px solid #ffffff;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.45));"></div>'
  return wrapper
}

function ensureLineLayer(
  map: MapLibreMap,
  layerId: string,
  sourceId: string,
  color: string,
  width: number,
  opacity = 0.95
) {
  if (map.getLayer(layerId)) {
    map.setPaintProperty(layerId, 'line-color', color)
    map.setPaintProperty(layerId, 'line-width', width)
    map.setPaintProperty(layerId, 'line-opacity', opacity)
  } else {
    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': color,
        'line-width': width,
        'line-opacity': opacity,
      },
    })
  }
}

function ensureFillLayer(
  map: MapLibreMap,
  layerId: string,
  sourceId: string,
  color: string,
  opacity = 0.12
) {
  if (map.getLayer(layerId)) {
    map.setPaintProperty(layerId, 'fill-color', color)
    map.setPaintProperty(layerId, 'fill-opacity', opacity)
  } else {
    map.addLayer({
      id: layerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': color,
        'fill-opacity': opacity,
      },
    })
  }
}

/**
 * Keep the visible route geometry in two stable sources.  Per-device sources
 * are still useful for drag previews, but recreating them while a panel
 * publishes state can leave the WebGL canvas without a line for a frame (the
 * DOM-based direction arrows are unaffected, which made the defect look like
 * floating arrows).  These sources are deliberately not tracked as disposable
 * per-device resources.
 */
function syncVisibleRouteLayers(
  map: MapLibreMap,
  routes: GeoJSON.FeatureCollection<GeoJSON.LineString>,
  activeRoutes: GeoJSON.FeatureCollection<GeoJSON.LineString>
) {
  const setSource = (id: string, data: GeoJSON.FeatureCollection<GeoJSON.LineString>) => {
    const source = map.getSource(id) as GeoJSONSource | undefined
    if (source) source.setData(data)
    else map.addSource(id, { type: 'geojson', data })
  }

  setSource('webgl-visible-routes', routes)
  setSource('webgl-visible-active-routes', activeRoutes)
  // Explicitly move these layers after creating/updating them. Raster tile
  // reloads can otherwise reinsert their paint layer above dynamically-added
  // GeoJSON layers, leaving only the DOM direction arrows visible.
  ensureLineLayer(map, 'webgl-visible-route-casing', 'webgl-visible-routes', '#172554', 16, 0.9)
  ensureLineLayer(map, 'webgl-visible-route-line', 'webgl-visible-routes', '#2563eb', 10, 1)
  ensureLineLayer(map, 'webgl-visible-active-route', 'webgl-visible-active-routes', '#7dd3fc', 6, 1)
  map.moveLayer('webgl-visible-route-casing')
  map.moveLayer('webgl-visible-route-line')
  map.moveLayer('webgl-visible-active-route')
}

export function MapLibreMapView({
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
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [isTileLoading, setIsTileLoading] = useState(false)
  const [cameraRevision, setCameraRevision] = useState(0)

  const selectedMarkerRef = useRef<MapLibreMarker | null>(null)
  const isDraggingSelectedPointRef = useRef(false)
  const liveMarkersRef = useRef<Map<string, MapLibreMarker>>(new Map())
  const overlayMarkersRef = useRef<Map<string, MapLibreMarker>>(new Map())
  const overlayArrowsRef = useRef<Map<string, MapLibreMarker[]>>(new Map())
  const arrowAnimationFramesRef = useRef<Map<string, number>>(new Map())
  const draggingOverlayIdsRef = useRef<Set<string>>(new Set())

  const trackedSourcesRef = useRef<Set<string>>(new Set())
  const trackedLayersRef = useRef<Set<string>>(new Set())

  const overlayMarkerCallbacksRef = useRef<Map<string, (e: { lat: number; lng: number; clientX: number; clientY: number }) => void>>(new Map())
  const overlayDragCallbacksRef = useRef<Map<string, (lat: number, lng: number) => void>>(new Map())
  const overlayDragEndCallbacksRef = useRef<Map<string, (lat: number, lng: number, rollback?: () => void) => void>>(new Map())
  const overlayMarkerPositionsRef = useRef<Map<string, LatLng>>(new Map())

  const overlaysRef = useRef(overlays)
  overlaysRef.current = overlays
  const focusedDeviceIdRef = useRef(focusedDeviceId)
  focusedDeviceIdRef.current = focusedDeviceId

  const onMapClickRef = useRef(onMapClick)
  onMapClickRef.current = onMapClick
  const onSelectedPointDragEndRef = useRef(onSelectedPointDragEnd)
  onSelectedPointDragEndRef.current = onSelectedPointDragEnd
  const viewportRef = useRef<MapViewport | null>(initialViewport ?? null)
  const onViewportChangeRef = useRef(onViewportChange)
  onViewportChangeRef.current = onViewportChange

  // Helper to safely add or update a GeoJSON source
  const setGeoJSONSource = useCallback((sourceId: string, data: GeoJSON.GeoJSON) => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource(sourceId) as GeoJSONSource | undefined
    if (source) {
      source.setData(data)
    } else {
      map.addSource(sourceId, {
        type: 'geojson',
        data,
      })
      trackedSourcesRef.current.add(sourceId)
    }
  }, [])

  // Helper to safely remove layer
  const removeLayerSafe = useCallback((layerId: string) => {
    const map = mapRef.current
    if (!map) return
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId)
    }
    trackedLayersRef.current.delete(layerId)
  }, [])

  // Helper to safely remove source
  const removeSourceSafe = useCallback((sourceId: string) => {
    const map = mapRef.current
    if (!map) return
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId)
    }
    trackedSourcesRef.current.delete(sourceId)
  }, [])

  // Initialize MapLibre GL instance
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const provider = tileProvider ?? DEFAULT_TILE_PROVIDER
    const rawTileUrl =
      provider.id === DEFAULT_TILE_PROVIDER.id
        ? `${API_BASE_URL}/api/map/tiles/{z}/{x}/{y}.png`
        : provider.url

    const tileUrl = rawTileUrl.replace('{s}', 'a')

    const map = new MapLibreMap({
      container: containerRef.current,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          'osm-raster-tiles': {
            type: 'raster',
            tiles: [tileUrl],
            tileSize: 256,
            attribution: provider.attribution,
            maxzoom: provider.maxZoom,
          },
          'webgl-visible-routes': { type: 'geojson', data: EMPTY_LINE_FEATURE_COLLECTION },
          'webgl-visible-active-routes': { type: 'geojson', data: EMPTY_LINE_FEATURE_COLLECTION },
        },
        layers: [
          {
            id: 'osm-raster-layer',
            type: 'raster',
            source: 'osm-raster-tiles',
            minzoom: 0,
            maxzoom: provider.maxZoom,
          },
          {
            id: 'webgl-visible-route-casing',
            type: 'line',
            source: 'webgl-visible-routes',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#172554', 'line-width': 16, 'line-opacity': 0.9 },
          },
          {
            id: 'webgl-visible-route-line',
            type: 'line',
            source: 'webgl-visible-routes',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#2563eb', 'line-width': 10, 'line-opacity': 1 },
          },
          {
            id: 'webgl-visible-active-route',
            type: 'line',
            source: 'webgl-visible-active-routes',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#7dd3fc', 'line-width': 6, 'line-opacity': 1 },
          },
        ],
      },
      center: viewportRef.current
        ? [viewportRef.current.lng, viewportRef.current.lat]
        : [DEFAULT_CENTER[1], DEFAULT_CENTER[0]],
      zoom: viewportRef.current?.zoom ?? DEFAULT_ZOOM,
      maxZoom: provider.maxZoom,
    })

    mapRef.current = map
    if (typeof window !== 'undefined') {
      ;(window as any)._maplibreMap = map
    }

    const navControl = new NavigationControl({
      showCompass: false,
      showZoom: true,
      visualizePitch: false,
    })
    map.addControl(navControl, 'top-right')

    map.addControl(
      new AttributionControl({
        compact: false,
        customAttribution: '<a href="https://maplibre.org" target="_blank">MapLibre</a>',
      }),
      'bottom-right'
    )

    map.on('load', () => {
      setMapLoaded(true)
      setIsTileLoading(false)
    })
    // A raster style can paint before its `load` event is observed after an
    // engine switch. `styledata` is the earlier safe point for restoring the
    // already-existing React overlays (start/end markers included).
    map.on('styledata', () => setMapLoaded(true))

    // `dataloading` also fires for every GeoJSON setData() call. Using it for
    // the tile badge leaves the badge permanently visible during navigation.
    // The initial map load is the only loading state we surface here.

    map.on('moveend', () => {
      const center = map.getCenter()
      const viewport = { lat: center.lat, lng: center.lng, zoom: map.getZoom() }
      viewportRef.current = viewport
      onViewportChangeRef.current?.(viewport)
    })

    let animationFrame: number | null = null
    const refreshProjectedRoute = () => {
      if (animationFrame !== null) return
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null
        setCameraRevision((revision) => revision + 1)
      })
    }
    map.on('move', refreshProjectedRoute)
    map.on('resize', refreshProjectedRoute)


    map.on('click', (e) => {
      onMapClickRef.current?.(e.lngLat.lat, e.lngLat.lng)
    })

    map.on('contextmenu', (e) => {
      e.originalEvent.preventDefault()
      const { lat, lng } = e.lngLat
      const focusedId = focusedDeviceIdRef.current
      const currentOverlays = overlaysRef.current ?? {}
      const targetOverlay = (focusedId && currentOverlays[focusedId]) || Object.values(currentOverlays)[0]
      targetOverlay?.onMapContextMenu?.({
        lat,
        lng,
        clientX: e.originalEvent.clientX,
        clientY: e.originalEvent.clientY,
      })
    })

    return () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame)
      for (const frameId of arrowAnimationFramesRef.current.values()) {
        cancelAnimationFrame(frameId)
      }
      arrowAnimationFramesRef.current.clear()
      for (const arrows of overlayArrowsRef.current.values()) {
        arrows.forEach((arrow) => arrow.remove())
      }
      overlayArrowsRef.current.clear()
      map.remove()
      mapRef.current = null
      setMapLoaded(false)
    }
  }, [tileProvider])

  // Selected Point Marker
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!selectedPoint) {
      selectedMarkerRef.current?.remove()
      selectedMarkerRef.current = null
      return
    }

    if (selectedMarkerRef.current) {
      if (!isDraggingSelectedPointRef.current) {
        selectedMarkerRef.current.setLngLat([selectedPoint.lng, selectedPoint.lat])
      }
    } else {
      const el = makeSelectedPointElement()
      const marker = new MapLibreMarker({
        element: el,
        draggable: true,
        anchor: 'bottom',
        // The custom pin's sharp tip is at y=30 inside its 38px wrapper.
        // Move the bottom-anchored wrapper down so that tip is the coordinate.
        offset: [0, 8],
      })
        .setLngLat([selectedPoint.lng, selectedPoint.lat])
        .addTo(map)

      marker.on('dragstart', () => {
        isDraggingSelectedPointRef.current = true
      })

      marker.on('dragend', () => {
        isDraggingSelectedPointRef.current = false
        const lngLat = marker.getLngLat()
        onSelectedPointDragEndRef.current?.(lngLat.lat, lngLat.lng)
      })

      selectedMarkerRef.current = marker
    }
  }, [selectedPoint])

  // Live Position Markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const currentPositions = livePositions ?? {}
    const activeIds = new Set(Object.keys(currentPositions))

    // Remove old
    for (const [id, marker] of liveMarkersRef.current.entries()) {
      if (!activeIds.has(id)) {
        marker.remove()
        liveMarkersRef.current.delete(id)
      }
    }

    // Add or update
    for (const [id, pos] of Object.entries(currentPositions)) {
      const isFocused = id === focusedDeviceId
      let marker = liveMarkersRef.current.get(id)
      if (!marker) {
        const el = makeLiveMarkerElement(isFocused)
        updateLiveMarkerElement(el, isFocused)
        marker = new MapLibreMarker({ element: el })
          .setLngLat([pos.lng, pos.lat])
          .addTo(map)
        liveMarkersRef.current.set(id, marker)
      } else {
        marker.setLngLat([pos.lng, pos.lat])
        updateLiveMarkerElement(marker.getElement(), isFocused)
      }
    }
  }, [livePositions, focusedDeviceId])

  // Synchronize All Overlays (Lines, Active Legs, Circles, Waypoints)
  const syncOverlays = useCallback(() => {
    const map = mapRef.current
    // `isStyleLoaded()` can remain false while raster tiles are still loading.
    // That made the first marker render but silently dropped every later panel
    // update (for example the destination entered after the start point).
    // The `load` event is the actual boundary after which custom sources and
    // layers can be safely added to this fixed style.
    if (!map || !mapLoaded) return

    const activeOverlays = overlays ?? {}
    const activeOverlayIds = new Set(Object.keys(activeOverlays))

    // 1. Sync Waypoint Markers
    const currentMarkerKeys = new Set<string>()
    const visibleRouteFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = []
    const visibleActiveRouteFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = []

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

          let marker = overlayMarkersRef.current.get(key)
          if (!marker) {
            overlayMarkerPositionsRef.current.set(key, { lat: m.lat, lng: m.lng })
            const el = makeBadgeElement(
              m.color || '#ff5e36',
              m.label,
              (e) => overlayMarkerCallbacksRef.current.get(key)?.(e),
              undefined,
              m.draggable
            )
            el.addEventListener('contextmenu', (event) => {
              const position = overlayMarkerPositionsRef.current.get(key)
              if (!position) return
              event.stopPropagation()
              event.preventDefault()
              overlayMarkerCallbacksRef.current.get(key)?.({
                ...position,
                clientX: event.clientX,
                clientY: event.clientY,
              })
            })
            marker = new MapLibreMarker({
              element: el,
              draggable: Boolean(m.draggable),
            })
              .setLngLat([m.lng, m.lat])
              .addTo(map)

            let originalPosition: LatLng | null = null
            marker.on('dragstart', () => {
              draggingOverlayIdsRef.current.add(key)
              const lngLat = marker!.getLngLat()
              originalPosition = { lat: lngLat.lat, lng: lngLat.lng }
              overlayArrowsRef.current.get(deviceId)?.forEach((arrow) => {
                arrow.getElement().style.opacity = '0'
              })
            })
            marker.on('drag', () => {
              const lngLat = marker!.getLngLat()
              const position = { lat: lngLat.lat, lng: lngLat.lng }
              overlayMarkerPositionsRef.current.set(key, position)
              const currentOverlay = overlaysRef.current?.[deviceId]
              if (m.pathIndex !== undefined && currentOverlay && currentOverlay.path.length >= 2) {
                const isClosedLoop =
                  currentOverlay.path.length >= 3 &&
                  currentOverlay.path[0].lat === currentOverlay.path[currentOverlay.path.length - 1].lat &&
                  currentOverlay.path[0].lng === currentOverlay.path[currentOverlay.path.length - 1].lng
                const previewPath = currentOverlay.path.map((point, index) =>
                  index === m.pathIndex || (isClosedLoop && m.pathIndex === 0 && index === currentOverlay.path.length - 1)
                    ? position
                    : point
                )
                const previewData: GeoJSON.Feature<GeoJSON.LineString> = {
                  type: 'Feature',
                  properties: {},
                  geometry: { type: 'LineString', coordinates: previewPath.map((point) => [point.lng, point.lat]) },
                }
                const source = map.getSource(`route-source-${deviceId}`) as GeoJSONSource | undefined
                source?.setData(previewData)
              }
              overlayDragCallbacksRef.current.get(key)?.(lngLat.lat, lngLat.lng)
            })
            marker.on('dragend', () => {
              const lngLat = marker!.getLngLat()
              const position = { lat: lngLat.lat, lng: lngLat.lng }
              overlayMarkerPositionsRef.current.set(key, position)
              const rollback = () => {
                if (!originalPosition) return
                marker!.setLngLat([originalPosition.lng, originalPosition.lat])
                overlayMarkerPositionsRef.current.set(key, originalPosition)
                const currentOverlay = overlaysRef.current?.[deviceId]
                if (m.pathIndex !== undefined && currentOverlay && currentOverlay.path.length >= 2) {
                  const source = map.getSource(`route-source-${deviceId}`) as GeoJSONSource | undefined
                  source?.setData({
                    type: 'Feature',
                    properties: {},
                    geometry: { type: 'LineString', coordinates: currentOverlay.path.map((point) => [point.lng, point.lat]) },
                  })
                }
              }
              overlayDragEndCallbacksRef.current.get(key)?.(position.lat, position.lng, rollback)
              requestAnimationFrame(() => {
                draggingOverlayIdsRef.current.delete(key)
                overlayArrowsRef.current.get(deviceId)?.forEach((arrow) => {
                  arrow.getElement().style.opacity = '1'
                })
              })
            })

            overlayMarkersRef.current.set(key, marker)
          } else {
            if (!draggingOverlayIdsRef.current.has(key)) {
              marker.setLngLat([m.lng, m.lat])
              overlayMarkerPositionsRef.current.set(key, { lat: m.lat, lng: m.lng })
            }
            marker.setDraggable(Boolean(m.draggable))
            updateBadgeElement(marker.getElement(), m.color || '#ff5e36', m.label, Boolean(m.draggable))
          }
        })
      }
    }

    for (const [key, marker] of overlayMarkersRef.current.entries()) {
      if (!currentMarkerKeys.has(key)) {
        marker.remove()
        overlayMarkersRef.current.delete(key)
        overlayMarkerCallbacksRef.current.delete(key)
        overlayDragCallbacksRef.current.delete(key)
        overlayDragEndCallbacksRef.current.delete(key)
        overlayMarkerPositionsRef.current.delete(key)
      }
    }

    for (const [deviceId, arrows] of overlayArrowsRef.current.entries()) {
      if (!activeOverlayIds.has(deviceId)) {
        arrows.forEach((arrow) => arrow.remove())
        overlayArrowsRef.current.delete(deviceId)
        const frameId = arrowAnimationFramesRef.current.get(deviceId)
        if (frameId) cancelAnimationFrame(frameId)
        arrowAnimationFramesRef.current.delete(deviceId)
      }
    }

    // 2. Clean up removed devices' GeoJSON sources and layers
    const validPrefixes = new Set(Array.from(activeOverlayIds).map((id) => `route-source-${id}`))
    const validActivePrefixes = new Set(Array.from(activeOverlayIds).map((id) => `route-active-source-${id}`))
    const validCirclePrefixes = new Set(Array.from(activeOverlayIds).map((id) => `route-circle-source-${id}`))

    for (const srcId of Array.from(trackedSourcesRef.current)) {
      if (!validPrefixes.has(srcId) && !validActivePrefixes.has(srcId) && !validCirclePrefixes.has(srcId)) {
        const casingId = srcId.replace('route-source-', 'route-casing-')
        const lineId = srcId.replace('route-source-', 'route-line-')
        const activeLineId = srcId.replace('route-active-source-', 'route-active-line-')
        const circleFillId = srcId.replace('route-circle-source-', 'route-circle-fill-')
        const circleLineId = srcId.replace('route-circle-source-', 'route-circle-line-')

        removeLayerSafe(casingId)
        removeLayerSafe(lineId)
        removeLayerSafe(activeLineId)
        removeLayerSafe(circleFillId)
        removeLayerSafe(circleLineId)
        removeSourceSafe(srcId)
      }
    }

    // 3. Render Route Lines, Active Legs, and Circles for each active device
    for (const [deviceId, overlay] of Object.entries(activeOverlays)) {
      const sourceId = `route-source-${deviceId}`
      const casingLayerId = `route-casing-${deviceId}`
      const lineLayerId = `route-line-${deviceId}`

      const activeSourceId = `route-active-source-${deviceId}`
      const activeLineLayerId = `route-active-line-${deviceId}`

      const circleSourceId = `route-circle-source-${deviceId}`
      const circleFillLayerId = `route-circle-fill-${deviceId}`
      const circleLineLayerId = `route-circle-line-${deviceId}`

      // Keep the GPU route geometry under the pointer while a waypoint drag is in
      // flight. React may otherwise publish the previous route before the panel
      // commits the new coordinate, causing a visible snap-back.
      const isRouteDragging = Array.from(draggingOverlayIdsRef.current).some((key) => key.startsWith(`${deviceId}-`))

      // Route Polyline
      const validCoords = (overlay?.path ?? [])
        .filter((p) => p && typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng))
        .map((p) => [p.lng, p.lat])

      if (validCoords.length >= 2) {
        visibleRouteFeatures.push({
          type: 'Feature',
          properties: { deviceId },
          geometry: { type: 'LineString', coordinates: validCoords },
        })
      }

      if (validCoords.length >= 2 && !isRouteDragging) {
        const geojsonData: GeoJSON.Feature<GeoJSON.LineString> = {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: validCoords,
          },
        }

        setGeoJSONSource(sourceId, geojsonData)
        ensureLineLayer(map, casingLayerId, sourceId, '#1c2451', 12, 0.55)
        ensureLineLayer(map, lineLayerId, sourceId, '#5b6bff', 8, 0.95)
        trackedLayersRef.current.add(casingLayerId)
        trackedLayersRef.current.add(lineLayerId)
      } else if (!isRouteDragging) {
        removeLayerSafe(lineLayerId)
        removeLayerSafe(casingLayerId)
        removeSourceSafe(sourceId)
      }

      // Active Route Leg (Yellow Highlight)
      const drawnPath = overlay?.path ?? []
      const activePathSource = activeLegFromDrawnPath(drawnPath, overlay?.activePath)
      const validActiveCoords = (activePathSource ?? [])
        .filter((p) => p && typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng))
        .map((p) => [p.lng, p.lat])

      if (validActiveCoords.length >= 2) {
        visibleActiveRouteFeatures.push({
          type: 'Feature',
          properties: { deviceId },
          geometry: { type: 'LineString', coordinates: validActiveCoords },
        })
      }

      if (validActiveCoords.length >= 2 && !isRouteDragging) {
        const activeGeoJSON: GeoJSON.Feature<GeoJSON.LineString> = {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: validActiveCoords,
          },
        }
        setGeoJSONSource(activeSourceId, activeGeoJSON)
        ensureLineLayer(map, activeLineLayerId, activeSourceId, '#93c5fd', 10, 0.9)
        trackedLayersRef.current.add(activeLineLayerId)
      } else if (!isRouteDragging) {
        removeLayerSafe(activeLineLayerId)
        removeSourceSafe(activeSourceId)
      }

      const arrowPath = activePathSource && activePathSource.length >= 2 ? activePathSource : drawnPath
      const segmentEnds: number[] = []
      let totalLength = 0
      for (let index = 0; index < arrowPath.length - 1; index++) {
        totalLength += haversineMeters(arrowPath[index], arrowPath[index + 1])
        segmentEnds.push(totalLength)
      }

      if (totalLength >= 40 && !isRouteDragging) {
        const arrowCount = Math.max(1, Math.floor(totalLength / ARROW_SPACING_METERS))
        const arrows = overlayArrowsRef.current.get(deviceId) ?? []
        while (arrows.length < arrowCount) {
          arrows.push(
            new MapLibreMarker({ element: makeArrowElement(), anchor: 'center' })
              .setLngLat([arrowPath[0].lng, arrowPath[0].lat])
              .addTo(map)
          )
        }
        while (arrows.length > arrowCount) {
          arrows.pop()?.remove()
        }
        overlayArrowsRef.current.set(deviceId, arrows)

        const currentFrame = arrowAnimationFramesRef.current.get(deviceId)
        if (currentFrame) cancelAnimationFrame(currentFrame)
        const animate = (timestamp: number) => {
          const cycleMs = 10_000
          const baseProgress = (timestamp % cycleMs) / cycleMs
          arrows.forEach((arrow, index) => {
            const sample = samplePathAtProgress(arrowPath, segmentEnds, totalLength, (baseProgress + index / arrowCount) % 1)
            arrow.setLngLat([sample.point.lng, sample.point.lat])
            const triangle = arrow.getElement().firstElementChild as HTMLElement | null
            if (triangle) triangle.style.transform = `rotate(${sample.bearing}deg)`
          })
          arrowAnimationFramesRef.current.set(deviceId, requestAnimationFrame(animate))
        }
        arrowAnimationFramesRef.current.set(deviceId, requestAnimationFrame(animate))
      } else if (!isRouteDragging) {
        overlayArrowsRef.current.get(deviceId)?.forEach((arrow) => arrow.remove())
        overlayArrowsRef.current.delete(deviceId)
        const frameId = arrowAnimationFramesRef.current.get(deviceId)
        if (frameId) cancelAnimationFrame(frameId)
        arrowAnimationFramesRef.current.delete(deviceId)
      }

      // Circle Overlay
      if (overlay?.circle && typeof overlay.circle.lat === 'number' && typeof overlay.circle.lng === 'number') {
        const circleGeoJSON = createCircleGeoJSON(overlay.circle, overlay.circle.radiusMeters)
        setGeoJSONSource(circleSourceId, circleGeoJSON)
        ensureFillLayer(map, circleFillLayerId, circleSourceId, '#4a9af0', 0.1)
        ensureLineLayer(map, circleLineLayerId, circleSourceId, '#4a9af0', 2, 1)
        trackedLayersRef.current.add(circleFillLayerId)
        trackedLayersRef.current.add(circleLineLayerId)
      } else {
        removeLayerSafe(circleFillLayerId)
        removeLayerSafe(circleLineLayerId)
        removeSourceSafe(circleSourceId)
      }
    }

    syncVisibleRouteLayers(
      map,
      { type: 'FeatureCollection', features: visibleRouteFeatures },
      { type: 'FeatureCollection', features: visibleActiveRouteFeatures }
    )
  }, [overlays, mapLoaded, setGeoJSONSource, removeLayerSafe, removeSourceSafe])

  // Trigger sync on overlays or mapLoaded change
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    syncOverlays()
  }, [overlays, mapLoaded, syncOverlays])

  // Camera FlyTo
  useEffect(() => {
    const map = mapRef.current
    if (!map || !flyTo) return

    map.stop()
    const targetZoom = Math.max(map.getZoom(), 14)
    const target = { lat: flyTo.lat, lng: flyTo.lng }
    const current = map.getCenter()
    if (haversineMeters({ lat: current.lat, lng: current.lng }, target) > 5_000) {
      map.jumpTo({ center: [target.lng, target.lat], zoom: targetZoom })
    } else {
      map.flyTo({ center: [target.lng, target.lat], zoom: targetZoom, duration: 600 })
    }
  }, [flyTo])

  // MapLibre markers are DOM nodes and work on all supported GPUs, but its
  // runtime GeoJSON pass is not reliably painted with the raster style on the
  // affected renderer. Project circles, complete routes, and active legs
  // through the same MapLibre camera as a DOM fallback. Keeping these as
  // separate passes matches Leaflet and preserves their visual stacking.
  const projectedRouteOverlay = (() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return null
    void cameraRevision
    const { clientWidth, clientHeight } = map.getContainer()
    if (!clientWidth || !clientHeight) return null

    const projectPath = (path: LatLng[]) => path.map((point) => {
      const projected = map.project([point.lng, point.lat])
      return `${projected.x},${projected.y}`
    }).join(' ')

    const routes = Object.entries(overlays ?? []).flatMap(([id, overlay]) => {
      if (!overlay.path || overlay.path.length < 2) return []
      return [{ id, points: projectPath(overlay.path) }]
    })
    const circles = Object.entries(overlays ?? []).flatMap(([id, overlay]) => {
      if (!overlay.circle || overlay.circle.radiusMeters <= 0) return []
      const ring = createCircleGeoJSON(overlay.circle, overlay.circle.radiusMeters).geometry.coordinates[0]
      const points = ring.map(([lng, lat]) => {
        const projected = map.project([lng, lat])
        return `${projected.x},${projected.y}`
      }).join(' ')
      return [{ id, points }]
    })
    const activeRoutes = Object.entries(overlays ?? []).flatMap(([id, overlay]) => {
      const activePath = activeLegFromDrawnPath(overlay.path, overlay.activePath)
      if (!activePath || activePath.length < 2) return []
      return [{ id, points: projectPath(activePath) }]
    })
    if (!routes.length && !circles.length) return null

    return (
      <svg
        aria-hidden="true"
        className="maplibre-projected-route-overlay maplibre-projected-map-overlay"
        viewBox={`0 0 ${clientWidth} ${clientHeight}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}
      >
        {circles.map((circle) => (
          <polygon
            key={circle.id}
            className="maplibre-projected-circle"
            data-route-id={circle.id}
            points={circle.points}
            fill="#4a9af0"
            fillOpacity="0.1"
            stroke="#4a9af0"
            strokeOpacity="1"
            strokeWidth="2"
          />
        ))}
        {routes.map((route) => (
          <g key={route.id} className="maplibre-route-path" data-route-id={route.id} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={route.points} stroke="#1c2451" strokeOpacity="0.55" strokeWidth="12" />
            <polyline points={route.points} stroke="#5b6bff" strokeOpacity="0.95" strokeWidth="8" />
          </g>
        ))}
        {activeRoutes.map((route) => (
          <polyline
            key={route.id}
            className="maplibre-active-route-path"
            data-route-id={route.id}
            points={route.points}
            fill="none"
            stroke="#93c5fd"
            strokeOpacity="0.9"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    )
  })()

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {projectedRouteOverlay}
      {isTileLoading && (
        <div className="map-tile-loading-badge" role="status" aria-live="polite">
          <span className="map-tile-loading-spinner" />
          WebGL 著色中...
        </div>
      )}
    </div>
  )
}
