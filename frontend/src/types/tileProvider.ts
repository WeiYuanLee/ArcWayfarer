export interface TileProviderConfig {
  id: string
  name: string
  url: string
  attribution: string
  cacheNamespace: string
  maxZoom: number
  subdomains?: string | string[]
}

export const DEFAULT_TILE_PROVIDER: TileProviderConfig = {
  id: 'osm-standard',
  name: 'OpenStreetMap',
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  cacheNamespace: 'osm-v2',
  maxZoom: 19,
  subdomains: 'abc',
}
