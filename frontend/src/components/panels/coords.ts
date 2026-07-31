import type { LatLng } from './types'

export function formatPoint(point: LatLng | null): string {
  return point ? `${point.lat.toFixed(4)},${point.lng.toFixed(4)}` : ''
}

export function parsePoint(text: string): LatLng | null {
  const parts = text.split(',').map((p) => p.trim())
  if (parts.length !== 2 || parts[0] === '' || parts[1] === '') return null
  const lat = Number(parts[0])
  const lng = Number(parts[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
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
