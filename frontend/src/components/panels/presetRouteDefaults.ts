import type { SavedRouteRuntimeConfig } from '../../services/api'

export const PRESET_ROUTE_MOTION = {
  nav_mode: 'bike',
  speed_kmh: 18.9,
} as const satisfies SavedRouteRuntimeConfig
