export const API_BASE_URL = 'http://127.0.0.1:8787'
export const WS_URL = 'ws://127.0.0.1:8787/ws/status'

export type DeviceStatus = 'ready' | 'mounting' | 'tunnel_required' | 'error'

export type Device = {
  udid: string
  name: string
  ios_version: string
  transport: 'lockdown' | 'rsd'
  status: DeviceStatus
  detail: string | null
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`)
    return res.ok
  } catch {
    return false
  }
}

export async function listDevices(): Promise<Device[]> {
  const res = await fetch(`${API_BASE_URL}/api/devices`)
  if (!res.ok) throw new Error(`Failed to list devices (${res.status})`)
  return res.json()
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`)
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return res.json()
}

async function deleteJson(path: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}${path}`, { method: 'DELETE' })
  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(payload?.detail ?? `Request failed (${res.status})`)
  }
}

export function amfiRevealDeveloperMode(udid: string): Promise<{ status: string }> {
  return postJsonWithResponse(`/api/devices/${udid}/amfi/reveal-developer-mode`, {})
}

async function postJsonWithResponse<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(payload?.detail ?? `Request failed (${res.status})`)
  }
  return payload as T
}

async function postJson(path: string, body: unknown): Promise<void> {
  await postJsonWithResponse(path, body)
}

export function setLocation(udid: string, lat: number, lng: number): Promise<void> {
  return postJson('/api/location/set', { udid, lat, lng })
}

export function clearLocation(udid: string): Promise<void> {
  return postJson('/api/location/clear', { udid })
}

export function goldDitto(udid: string, lat: number, lng: number): Promise<void> {
  return postJson('/api/location/gold-ditto', { udid, lat, lng })
}

export type NavMode = 'walk' | 'bike' | 'drive'
export type LatLng = { lat: number; lng: number }

export async function getNavModeSpeeds(): Promise<Record<NavMode, number>> {
  const res = await fetch(`${API_BASE_URL}/api/navigate/modes`)
  if (!res.ok) throw new Error(`Failed to load nav modes (${res.status})`)
  return res.json()
}

export function startNavigate(
  udid: string,
  navMode: NavMode,
  start: LatLng,
  end: LatLng,
  customSpeedKmh?: number
): Promise<{ status: string; route: LatLng[] }> {
  return postJsonWithResponse('/api/navigate/start', {
    udid,
    nav_mode: navMode,
    start,
    end,
    custom_speed_kmh: customSpeedKmh ?? null,
  })
}

export function stopNavigate(udid: string): Promise<void> {
  return postJson('/api/navigate/stop', { udid })
}

export function pauseNavigate(udid: string): Promise<void> {
  return postJson('/api/navigate/pause', { udid })
}

export function resumeNavigate(udid: string): Promise<void> {
  return postJson('/api/navigate/resume', { udid })
}

export type StationPause = { enabled: boolean; min: number; max: number }

export function startRouteLoop(
  udid: string,
  navMode: NavMode,
  waypoints: LatLng[],
  stationPause: StationPause,
  customSpeedKmh?: number
): Promise<{ status: string; route: LatLng[] }> {
  return postJsonWithResponse('/api/route-loop/start', {
    udid,
    nav_mode: navMode,
    waypoints,
    pause_enabled: stationPause.enabled,
    pause_min: stationPause.min,
    pause_max: stationPause.max,
    custom_speed_kmh: customSpeedKmh ?? null,
  })
}

export function stopRouteLoop(udid: string): Promise<void> {
  return postJson('/api/route-loop/stop', { udid })
}

export function pauseRouteLoop(udid: string): Promise<void> {
  return postJson('/api/route-loop/pause', { udid })
}

export function resumeRouteLoop(udid: string): Promise<void> {
  return postJson('/api/route-loop/resume', { udid })
}

export type MultiStopOptions = {
  straightLine?: boolean
  jumpMode?: boolean
  jumpPreDelay?: number
  jumpPostDelay?: number
  customSpeedKmh?: number
}

export function startMultiStop(
  udid: string,
  navMode: NavMode,
  waypoints: LatLng[],
  stationPause: StationPause,
  options: MultiStopOptions = {}
): Promise<{ status: string; route: LatLng[] }> {
  return postJsonWithResponse('/api/multi-stop/start', {
    udid,
    nav_mode: navMode,
    waypoints,
    pause_enabled: stationPause.enabled,
    pause_min: stationPause.min,
    pause_max: stationPause.max,
    straight_line: options.straightLine ?? false,
    jump_mode: options.jumpMode ?? false,
    jump_pre_delay: options.jumpPreDelay ?? 0,
    jump_post_delay: options.jumpPostDelay ?? 0,
    custom_speed_kmh: options.customSpeedKmh ?? null,
  })
}

export function stopMultiStop(udid: string): Promise<void> {
  return postJson('/api/multi-stop/stop', { udid })
}

export function pauseMultiStop(udid: string): Promise<void> {
  return postJson('/api/multi-stop/pause', { udid })
}

export function resumeMultiStop(udid: string): Promise<void> {
  return postJson('/api/multi-stop/resume', { udid })
}

export function startRandomWalk(
  udid: string,
  navMode: NavMode,
  center: LatLng,
  radiusM: number,
  stationPause: StationPause,
  customSpeedKmh?: number,
  straightLine = true
): Promise<void> {
  return postJson('/api/random-walk/start', {
    udid,
    nav_mode: navMode,
    center,
    radius_m: radiusM,
    pause_enabled: stationPause.enabled,
    pause_min: stationPause.min,
    pause_max: stationPause.max,
    custom_speed_kmh: customSpeedKmh ?? null,
    straight_line: straightLine,
  })
}

export function stopRandomWalk(udid: string): Promise<void> {
  return postJson('/api/random-walk/stop', { udid })
}

export function pauseRandomWalk(udid: string): Promise<void> {
  return postJson('/api/random-walk/pause', { udid })
}

export function resumeRandomWalk(udid: string): Promise<void> {
  return postJson('/api/random-walk/resume', { udid })
}

export function startJoystick(
  udid: string,
  navMode: NavMode,
  lat: number,
  lng: number,
  customSpeedKmh?: number
): Promise<void> {
  return postJson('/api/location/joystick/start', {
    udid,
    nav_mode: navMode,
    lat,
    lng,
    custom_speed_kmh: customSpeedKmh ?? null,
  })
}

export function stopJoystick(udid: string): Promise<void> {
  return postJson('/api/location/joystick/stop', { udid })
}

export type HistoryKind = 'teleport' | 'navigate' | 'route_loop' | 'multi_stop' | 'random_walk' | 'joystick'

export type HistoryEntry = {
  lat: number
  lng: number
  kind: HistoryKind
  name: string | null
  ts: number
}

export function listHistory(): Promise<HistoryEntry[]> {
  return getJson('/api/history')
}

export function pushHistory(entry: { lat: number; lng: number; kind: HistoryKind; name?: string }): Promise<HistoryEntry> {
  return postJsonWithResponse('/api/history', entry)
}

export function clearHistory(): Promise<void> {
  return deleteJson('/api/history')
}

export type Favorite = {
  id: string
  name: string
  lat: number
  lng: number
  created_at: number
}

export function listFavorites(): Promise<Favorite[]> {
  return getJson('/api/favorites')
}

export function addFavorite(input: { name: string; lat: number; lng: number }): Promise<Favorite> {
  return postJsonWithResponse('/api/favorites', input)
}

export function deleteFavorite(id: string): Promise<void> {
  return deleteJson(`/api/favorites/${id}`)
}
