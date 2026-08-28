import type { LatLng } from './types'

export function formatPoint(point: LatLng | null): string {
  return point ? `${point.lat.toFixed(4)},${point.lng.toFixed(4)}` : ''
}

export function parsePoint(text: string): LatLng | null {
  if (!text) return null
  const trimmed = text.trim()
  
  // Check for URL containing @lat,lng, ?q=lat,lng, !3dlat!4dlng, ll=lat,lng, or /loc:lat+lng
  const urlMatch = trimmed.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/) ||
                   trimmed.match(/[?&]q=(-?\d+(?:\.\d+)?)(?:%2C|,|\s)+(-?\d+(?:\.\d+)?)/) ||
                   trimmed.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) ||
                   trimmed.match(/[?&]ll=(-?\d+(?:\.\d+)?)(?:%2C|,|\s)+(-?\d+(?:\.\d+)?)/) ||
                   trimmed.match(/\/loc:(-?\d+(?:\.\d+)?)\+(-?\d+(?:\.\d+)?)/)
  if (urlMatch) {
    const lat = Number(urlMatch[1])
    const lng = Number(urlMatch[2])
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng }
    }
  }

  // Check for DMS Degree-Minute-Second format (e.g. 25°02'02.4"N 121°33'54.0"E)
  const dmsMatch = trimmed.match(
    /(\d+)[°\s]+(\d+)['\s]+(\d+(?:\.\d+)?)["\s]*([NSns])[,\s]+(\d+)[°\s]+(\d+)['\s]+(\d+(?:\.\d+)?)["\s]*([EWew])/
  )
  if (dmsMatch) {
    let lat = Number(dmsMatch[1]) + Number(dmsMatch[2]) / 60 + Number(dmsMatch[3]) / 3600
    if (dmsMatch[4].toUpperCase() === 'S') lat = -lat
    let lng = Number(dmsMatch[5]) + Number(dmsMatch[6]) / 60 + Number(dmsMatch[7]) / 3600
    if (dmsMatch[8].toUpperCase() === 'W') lng = -lng
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng }
    }
  }

  // Check for standard numbers separated by comma, space, colon, slash, or tab
  const match = trimmed.match(/(-?\d+(?:\.\d+)?)[,\s:\/;\t]+(-?\d+(?:\.\d+)?)/)
  if (!match) return null
  const lat = Number(match[1])
  const lng = Number(match[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

// Match every pair in the pasted text instead of assuming one pair per line.
// OCR commonly collapses line breaks or uses full-width punctuation.
const PASTED_COORDINATE_PATTERN = /(-?\d+(?:\.\d+)?)[^-\d.]+(-?\d+(?:\.\d+)?)/g

export function parsePastedPoints(text: string): { points: LatLng[]; invalidCount: number } {
  const points: LatLng[] = []
  let invalidCount = 0
  // NFKC converts full-width digits and punctuation. Replace Chinese characters
  // with whitespace rather than parsing them or allowing adjacent numbers to join.
  const normalized = text.normalize('NFKC').replace(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g, ' ')
  let match: RegExpExecArray | null

  while ((match = PASTED_COORDINATE_PATTERN.exec(normalized)) !== null) {

    const lat = Number(match[1])
    const lng = Number(match[2])
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      invalidCount++
      continue
    }

    points.push({ lat, lng })
  }

  return { points, invalidCount: points.length === 0 && invalidCount === 0 && normalized.trim() !== '' ? 1 : invalidCount }
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

/**
 * Returns the road geometry for the leg that starts at `currentStop`.
 * `routePath` is the playback path returned by the backend, which contains every
 * interpolated road point in waypoint order. Falling back to the waypoint pair
 * keeps the preview useful before a route has been planned.
 */
export function routeLegForStop(
  routePath: LatLng[],
  waypoints: LatLng[],
  currentStop: number,
  isLoop: boolean
): LatLng[] | null {
  if (waypoints.length < 2) return null

  const legIndex = Math.max(0, Math.min(currentStop - 1, waypoints.length - 1))
  if (!isLoop && legIndex >= waypoints.length - 1) return null
  const fallback = [waypoints[legIndex], waypoints[(legIndex + 1) % waypoints.length]]
  if (routePath.length < 2) return fallback

  let cursor = 0
  for (let index = 0; index <= legIndex; index++) {
    const destination = waypoints[(index + 1) % waypoints.length]
    let destinationIndex = cursor
    let closestDistance = Infinity
    for (let pointIndex = cursor; pointIndex < routePath.length; pointIndex++) {
      const distance = haversineDistanceKm(routePath[pointIndex], destination)
      if (distance < closestDistance) {
        closestDistance = distance
        destinationIndex = pointIndex
      }
    }
    if (index === legIndex && destinationIndex > cursor) return routePath.slice(cursor, destinationIndex + 1)
    cursor = destinationIndex
  }

  return fallback
}

/** Estimates the remaining distance on the active route leg from the live position. */
export function calculateRemainingDistanceMeters(
  routePath: LatLng[] | undefined,
  waypoints: (LatLng | null)[] | undefined,
  livePosition: LatLng | null | undefined,
  currentStop: number | null | undefined,
  isLoop: boolean
): number | null {
  if (!livePosition) return null
  const validWaypoints = (waypoints || []).filter((point): point is LatLng => point !== null)
  const leg = routeLegForStop(routePath || [], validWaypoints, currentStop || 1, isLoop)
  if (!leg || leg.length < 2) return null

  let closestIndex = 0
  let closestDistance = Infinity
  for (let index = 0; index < leg.length; index++) {
    const distance = haversineDistanceKm(livePosition, leg[index])
    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = index
    }
  }

  let remainingKm = closestDistance
  for (let index = closestIndex + 1; index < leg.length; index++) {
    remainingKm += haversineDistanceKm(leg[index - 1], leg[index])
  }
  return Math.max(0, remainingKm * 1000)
}

export function movePoint(center: LatLng, bearingDeg: number, distanceMeters: number): LatLng {
  const EARTH_RADIUS_M = 6371000.0
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const toDeg = (rad: number) => (rad * 180) / Math.PI

  const bearing = toRad(bearingDeg)
  const angularDistance = distanceMeters / EARTH_RADIUS_M

  const lat1 = toRad(center.lat)
  const lng1 = toRad(center.lng)

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  )
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    )

  return { lat: toDeg(lat2), lng: toDeg(lng2) }
}

export function pointsOnCircle(center: LatLng, radiusMeters: number, count: number): LatLng[] {
  const safeCount = Math.max(4, Math.floor(count))
  const points: LatLng[] = []
  for (let i = 0; i < safeCount; i++) {
    const bearing = (360 / safeCount) * i
    points.push(movePoint(center, bearing, radiusMeters))
  }
  return points
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
