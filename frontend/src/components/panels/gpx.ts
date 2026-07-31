import type { LatLng } from './types'

function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

function pointsFromSelector(doc: Document, selector: string): LatLng[] {
  const points: LatLng[] = []
  doc.querySelectorAll(selector).forEach((el) => {
    const lat = Number(el.getAttribute('lat'))
    const lng = Number(el.getAttribute('lon'))
    if (isValidLatLng(lat, lng)) points.push({ lat, lng })
  })
  return points
}

export function parseGpx(xmlText: string): LatLng[] {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  if (doc.querySelector('parsererror')) return []

  const trackPoints = pointsFromSelector(doc, 'trk trkseg trkpt')
  if (trackPoints.length > 0) return trackPoints

  const routePoints = pointsFromSelector(doc, 'rte rtept')
  if (routePoints.length > 0) return routePoints

  return pointsFromSelector(doc, 'wpt')
}
