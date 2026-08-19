import { useState, type ReactNode } from 'react'
import { IconStack2 } from '@tabler/icons-react'
import { LeafletMapView } from './LeafletMapView'
import { MapLibreMapView } from './MapLibreMapView'
import type { MapOverlay } from '../panels/types'
import type { TileProviderConfig } from '../../types/tileProvider'

export type MapEngine = 'leaflet' | 'maplibre'

const STORAGE_KEY_MAP_ENGINE = 'arcwayfarer.map_engine'

type LatLng = { lat: number; lng: number }
type FlyTarget = { lat: number; lng: number; id: number }
export type MapViewport = { lat: number; lng: number; zoom: number }

export type MapViewProps = {
  onMapClick?: (lat: number, lng: number) => void
  focusedDeviceId?: string | null
  selectedPoint?: LatLng | null
  onSelectedPointDragEnd?: (lat: number, lng: number) => void
  livePositions?: Record<string, LatLng>
  overlays?: Record<string, MapOverlay>
  flyTo?: FlyTarget | null
  tileProvider?: TileProviderConfig
  isEngineSwitchLocked?: boolean
  children?: ReactNode
}

export function MapView({ children, isEngineSwitchLocked = false, ...props }: MapViewProps) {
  const [engine, setEngine] = useState<MapEngine>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_MAP_ENGINE)
    return saved === 'maplibre' ? 'maplibre' : 'leaflet'
  })

  const [isEngineMenuOpen, setIsEngineMenuOpen] = useState(false)
  const [viewport, setViewport] = useState<MapViewport | null>(null)

  const handleViewportChange = (nextViewport: MapViewport) => {
    setViewport((currentViewport) => {
      if (
        currentViewport &&
        Math.abs(currentViewport.lat - nextViewport.lat) < 0.000001 &&
        Math.abs(currentViewport.lng - nextViewport.lng) < 0.000001 &&
        Math.abs(currentViewport.zoom - nextViewport.zoom) < 0.001
      ) {
        return currentViewport
      }
      return nextViewport
    })
  }

  const toggleEngine = (newEngine: MapEngine) => {
    if (isEngineSwitchLocked) return
    setEngine(newEngine)
    localStorage.setItem(STORAGE_KEY_MAP_ENGINE, newEngine)
    setIsEngineMenuOpen(false)
  }

  return (
    <div className="map-view-wrapper" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {engine === 'leaflet' ? (
        <LeafletMapView key="leaflet-engine" {...props} initialViewport={viewport} onViewportChange={handleViewportChange} />
      ) : (
        <MapLibreMapView key="maplibre-engine" {...props} initialViewport={viewport} onViewportChange={handleViewportChange} />
      )}

      {/* Children overlays (ControlsOverlay, IconRail, StatusBar) rendered directly in stacking context */}
      {children}

      <div className="map-engine-control">
        <button
          type="button"
          className={`map-engine-trigger${isEngineMenuOpen ? ' active' : ''}`}
          onClick={() => setIsEngineMenuOpen((open) => !open)}
          disabled={isEngineSwitchLocked}
          aria-expanded={isEngineMenuOpen}
          aria-haspopup="menu"
          aria-label="地圖模式"
          title={isEngineSwitchLocked ? '執行中無法切換地圖模式' : '地圖模式'}
        >
          <IconStack2 size={21} stroke={1.8} />
        </button>
        {isEngineMenuOpen && (
          <div className="map-engine-menu" role="menu" aria-label="地圖模式">
            <strong>地圖模式</strong>
            <button type="button" role="menuitemradio" aria-checked={engine === 'leaflet'} className={engine === 'leaflet' ? 'active' : ''} onClick={() => toggleEngine('leaflet')}>
              <span>標準模式</span><small>Leaflet 經典 DOM 模式，穩定省資源</small>
            </button>
            <button type="button" role="menuitemradio" aria-checked={engine === 'maplibre'} className={engine === 'maplibre' ? 'active' : ''} onClick={() => toggleEngine('maplibre')}>
              <span>高效能模式</span><small>MapLibre WebGL GPU 硬體加速，極致流暢</small>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
