import { Component, lazy, Suspense, useState, type ErrorInfo, type ReactNode } from 'react'
import { IconStack2 } from '@tabler/icons-react'
import type { MapOverlay } from '../panels/types'
import type { TileProviderConfig } from '../../types/tileProvider'

const LeafletMapView = lazy(() => import('./LeafletMapView').then((module) => ({ default: module.LeafletMapView })))
const MapLibreMapView = lazy(() => import('./MapLibreMapView').then((module) => ({ default: module.MapLibreMapView })))

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

type MapErrorBoundaryProps = {
  children: ReactNode
  onRetry: () => void
  onUseStandard: () => void
}

class MapErrorBoundary extends Component<MapErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[map] renderer failed', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--aw-canvas)', zIndex: 2 }}>
        <div style={{ display: 'grid', gap: 10, maxWidth: 360, padding: 20, textAlign: 'center' }}>
          <strong>地圖繪製暫時失敗</strong>
          <span>定位仍在背景執行，可以重建地圖或切換到標準模式。</span>
          <button type="button" onClick={this.props.onRetry}>重新載入地圖</button>
          <button type="button" onClick={this.props.onUseStandard}>切換標準模式</button>
        </div>
      </div>
    )
  }
}

export function MapView({ children, isEngineSwitchLocked = false, ...props }: MapViewProps) {
  const [engine, setEngine] = useState<MapEngine>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_MAP_ENGINE)
    return saved === 'maplibre' ? 'maplibre' : 'leaflet'
  })

  const [isEngineMenuOpen, setIsEngineMenuOpen] = useState(false)
  const [viewport, setViewport] = useState<MapViewport | null>(null)
  const [mapRevision, setMapRevision] = useState(0)

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

  const useStandardAfterFailure = () => {
    setEngine('leaflet')
    localStorage.setItem(STORAGE_KEY_MAP_ENGINE, 'leaflet')
    setMapRevision((revision) => revision + 1)
  }

  return (
    <div className="map-view-wrapper" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <MapErrorBoundary
        key={`${engine}-${mapRevision}`}
        onRetry={() => setMapRevision((revision) => revision + 1)}
        onUseStandard={useStandardAfterFailure}
      >
        <Suspense fallback={<div className="map-engine-loading" role="status">載入地圖引擎中...</div>}>
          {engine === 'leaflet' ? (
            <LeafletMapView {...props} initialViewport={viewport} onViewportChange={handleViewportChange} />
          ) : (
            <MapLibreMapView {...props} initialViewport={viewport} onViewportChange={handleViewportChange} />
          )}
        </Suspense>
      </MapErrorBoundary>

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
