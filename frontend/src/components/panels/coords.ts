import type { LatLng } from './types'

export function formatPoint(point: LatLng | null): string {
  return point ? `${point.lat.toFixed(4)},${point.lng.toFixed(4)}` : ''
}

export function parsePoint(text: string): LatLng | null {
  if (!text) return null
  const trimmed = text.trim()
  
  // Check for URL containing @lat,lng or ?q=lat,lng
  const urlMatch = trimmed.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/) ||
                   trimmed.match(/[?&]q=(-?\d+(?:\.\d+)?)(?:%2C|,)(-?\d+(?:\.\d+)?)/)
  if (urlMatch) {
    const lat = Number(urlMatch[1])
    const lng = Number(urlMatch[2])
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng }
    }
  }

  // Check for standard numbers separated by comma, space, or parentheses
  const match = trimmed.match(/(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/)
  if (!match) return null
  const lat = Number(match[1])
  const lng = Number(match[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

const PASTE_LINE_PATTERN = /(-?\d+(?:\.\d+)?)[^-\d.]+(-?\d+(?:\.\d+)?)/

export function parsePastedPoints(text: string): { points: LatLng[]; invalidCount: number } {
  const points: LatLng[] = []
  let invalidCount = 0

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '') continue

    const match = line.match(PASTE_LINE_PATTERN)
    if (!match) {
      invalidCount++
      continue
    }

    const lat = Number(match[1])
    const lng = Number(match[2])
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      invalidCount++
      continue
    }

    points.push({ lat, lng })
  }

  return { points, invalidCount }
}

export function formatEta(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const mm = Math.floor(total / 60)
  const ss = total % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const R = 6371 // Earth radius in km
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function estimateDurationMinutes(distanceKm: number, speedKmh: number): number {
  if (speedKmh <= 0) return 0
  return Math.round((distanceKm / speedKmh) * 60)
}

export function calculateRouteProgressPct(
  routePath: LatLng[] | undefined,
  waypoints: (LatLng | null)[] | undefined,
  livePosition: LatLng | null | undefined,
  currentIndex: number | null | undefined,
  totalPoints: number,
  isLoop: boolean = false
): number {
  if (!livePosition) {
    const current = Math.max(1, Math.min(currentIndex || 1, totalPoints))
    return Math.min(100, Math.round((current / Math.max(1, totalPoints)) * 100))
  }

  let path = (routePath || []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng))

  if (path.length < 2) {
    path = (waypoints || []).filter(
      (w): w is LatLng => w !== null && Number.isFinite(w.lat) && Number.isFinite(w.lng)
    )
  }

  if (path.length < 2) {
    const current = Math.max(1, Math.min(currentIndex || 1, totalPoints))
    return Math.min(100, Math.round((current / Math.max(1, totalPoints)) * 100))
  }

  if (isLoop) {
    const first = path[0]
    const last = path[path.length - 1]
    if (Math.abs(first.lat - last.lat) > 1e-6 || Math.abs(first.lng - last.lng) > 1e-6) {
      path = [...path, first]
    }
  }

  const cumDist: number[] = [0]
  for (let i = 1; i < path.length; i++) {
    cumDist.push(cumDist[i - 1] + haversineDistanceKm(path[i - 1], path[i]))
  }
  const totalDist = cumDist[cumDist.length - 1]
  if (totalDist <= 0) {
    const current = Math.max(1, Math.min(currentIndex || 1, totalPoints))
    return Math.min(100, Math.round((current / Math.max(1, totalPoints)) * 100))
  }

  let minSegDist = Infinity
  let bestTraversedDist = 0

  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i]
    const p2 = path[i + 1]
    const segLen = cumDist[i + 1] - cumDist[i]

    let t = 0
    if (segLen > 0) {
      const dx = p2.lng - p1.lng
      const dy = p2.lat - p1.lat
      const px = livePosition.lng - p1.lng
      const py = livePosition.lat - p1.lat
      const lenSq = dx * dx + dy * dy
      if (lenSq > 0) {
        t = Math.min(1, Math.max(0, (px * dx + py * dy) / lenSq))
      }
    }

    const projLat = p1.lat + t * (p2.lat - p1.lat)
    const projLng = p1.lng + t * (p2.lng - p1.lng)
    const distToSeg = haversineDistanceKm(livePosition, { lat: projLat, lng: projLng })

    if (distToSeg < minSegDist) {
      minSegDist = distToSeg
      bestTraversedDist = cumDist[i] + t * segLen
    }
  }

  const pct = (bestTraversedDist / totalDist) * 100
  return Math.min(100, Math.max(0, Math.round(pct)))
}


