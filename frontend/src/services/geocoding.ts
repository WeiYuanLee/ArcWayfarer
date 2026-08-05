export interface PlaceSearchResult {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  category?: string
}

/**
 * Searches for places matching the given keyword via OpenStreetMap Nominatim API.
 */
export async function searchPlaceByKeyword(
  keyword: string,
  signal?: AbortSignal
): Promise<PlaceSearchResult[]> {
  const trimmed = keyword.trim()
  if (!trimmed) return []

  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'json')
  url.searchParams.set('q', trimmed)
  url.searchParams.set('limit', '8')
  url.searchParams.set('addressdetails', '1')

  const response = await fetch(url.toString(), {
    signal,
    headers: {
      // NOTE (Tech Debt): 'User-Agent' is a forbidden header name in browser Fetch API / Electron renderer.
      // Custom User-Agent will be ignored or overridden by the browser. Consider proxying geocoding via backend API.
      'User-Agent': 'ArcWayfarer-Location-Simulator/1.0',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    },
  })

  if (!response.ok) {
    throw new Error(`Search failed: ${response.statusText}`)
  }

  const data = await response.json()

  return data.map((item: any) => {
    // Extract concise display title (item.name or first component of display_name)
    const rawName = item.name || (item.display_name ? item.display_name.split(',')[0] : item.display_name)
    return {
      id: `osm-${item.place_id}`,
      name: rawName,
      address: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      category: item.type || item.class,
    }
  })
}
