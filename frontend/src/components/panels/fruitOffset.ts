import type { LatLng } from './types'

export type FruitOffsetOptions = {
  distanceMeters: number
  /**
   * A seed makes random previews stable. Keep it with the generated result so
   * map preview, copied text, and GPX always describe the same points.
   */
  seed?: string | number
}

export type FruitOffsetPoint = {
  id: string
  flowerIndex: number
  flower: LatLng
  point: LatLng
  bearingDegrees: number
  distanceMeters: number
}

const METERS_PER_DEGREE_LATITUDE = 111_320

function normalizedBearing(bearing: number): number {
  return ((bearing % 360) + 360) % 360
}

function seedToUint32(seed: string | number): number {
  const text = String(seed)
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** Small deterministic PRNG: sufficient for visual distribution, not cryptography. */
function mulberry32(seed: number): () => number {
  let value = seed
  return () => {
    value += 0x6D2B79F5
    let result = value
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

/** Returns a point offset from origin using a north-clockwise bearing. */
export function offsetCoordinate(origin: LatLng, distanceMeters: number, bearingDegrees: number): LatLng {
  const distance = Math.max(0, Number.isFinite(distanceMeters) ? distanceMeters : 0)
  const bearingRadians = (normalizedBearing(bearingDegrees) * Math.PI) / 180
  const latitudeDelta = (distance * Math.cos(bearingRadians)) / METERS_PER_DEGREE_LATITUDE
  const longitudeDenominator = METERS_PER_DEGREE_LATITUDE * Math.cos((origin.lat * Math.PI) / 180)
  const longitudeDelta = Math.abs(longitudeDenominator) > Number.EPSILON
    ? (distance * Math.sin(bearingRadians)) / longitudeDenominator
    : 0
  return { lat: origin.lat + latitudeDelta, lng: origin.lng + longitudeDelta }
}

export function generateFruitOffsets(flowers: LatLng[], options: FruitOffsetOptions): FruitOffsetPoint[] {
  const distanceMeters = Math.max(0, Number.isFinite(options.distanceMeters) ? options.distanceMeters : 0)
  const random = mulberry32(seedToUint32(options.seed ?? 'arcwayfarer-fruit-offset'))

  return flowers
    .filter((flower) => Number.isFinite(flower.lat) && Number.isFinite(flower.lng))
    .map((flower, flowerIndex) => {
      const bearingDegrees = random() * 360
      return {
        id: `fruit-${flowerIndex + 1}`,
        flowerIndex,
        flower,
        point: offsetCoordinate(flower, distanceMeters, bearingDegrees),
        bearingDegrees,
        distanceMeters,
      }
    })
}

export function formatFruitOffsetText(points: FruitOffsetPoint[], distanceMeters?: number): string {
  const distance = distanceMeters ?? points[0]?.distanceMeters ?? 0
  const header = `今日開花領果座標（已位移 ${Math.round(distance)}m）：`
  return [header, ...points.map(({ point }) => `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`)].join('\n')
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'\"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character]!)
}

/** GPX waypoints can be imported by ArcWayfarer and common GPS tools. */
export function fruitOffsetsToGpx(points: FruitOffsetPoint[]): string {
  const waypoints = points.map(({ flowerIndex, point, distanceMeters }) => {
    const name = `Fruit #${flowerIndex + 1} (Flower #${flowerIndex + 1})`
    return `  <wpt lat="${point.lat.toFixed(6)}" lon="${point.lng.toFixed(6)}"><name>${escapeXml(name)}</name><desc>${escapeXml(`Suggested fruit offset, ${Math.round(distanceMeters)}m from Flower #${flowerIndex + 1}`)}</desc></wpt>`
  })
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<gpx version="1.1" creator="ArcWayfarer" xmlns="http://www.topografix.com/GPX/1/1">', ...waypoints, '</gpx>', ''].join('\n')
}

export function downloadFruitOffsetsGpx(points: FruitOffsetPoint[], filename = 'fruit-offsets.gpx'): void {
  const blob = new Blob([fruitOffsetsToGpx(points)], { type: 'application/gpx+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
