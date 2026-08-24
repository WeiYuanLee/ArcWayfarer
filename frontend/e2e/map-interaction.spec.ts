import { test, expect, type Page } from '@playwright/test'

const plannedRoute = [
  { lat: 25.0415, lng: 121.5438 },
  { lat: 25.0430, lng: 121.5520 },
  { lat: 25.0408, lng: 121.5713 },
]

async function mockReadyDeviceAndNavigationPreview(page: Page) {
  const requests = { preview: 0, start: 0 }
  await page.route('http://127.0.0.1:8787/api/devices', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([{
      udid: 'navigation-preview-test-device',
      name: 'Navigation Preview Test Device',
      ios_version: 'test',
      transport: 'lockdown',
      status: 'ready',
      detail: null,
    }]),
  }))
  await page.route('http://127.0.0.1:8787/api/navigate/preview', (route) => {
    requests.preview += 1
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', route: plannedRoute, distance_m: 2450 }),
    })
  })
  await page.route('http://127.0.0.1:8787/api/navigate/start', (route) => {
    requests.start += 1
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', route: plannedRoute }),
    })
  })
  await page.reload()
  return requests
}

test.describe('Map Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('arcwayfarer.map_engine'))
    await page.goto('/')
  })

  test('地圖容器應正確載入', async ({ page }) => {
    const mapContainer = page.locator('.leaflet-container')
    await expect(mapContainer).toBeVisible({ timeout: 10_000 })
  })

  test('應顯示頂部工具列', async ({ page }) => {
    await expect(page.locator('.top-bar')).toBeVisible()
  })

  test('應顯示側邊圖示列', async ({ page }) => {
    await expect(page.locator('.icon-rail')).toBeVisible()
  })

  test('應顯示狀態列', async ({ page }) => {
    await expect(page.locator('.status-bar')).toBeVisible()
  })

  test('地圖應包含縮放控制按鈕', async ({ page }) => {
    await page.locator('.leaflet-container').waitFor({ timeout: 10_000 })
    const zoomIn = page.locator('.leaflet-control-zoom-in')
    await expect(zoomIn).toBeVisible()
  })

  test('可在兩種地圖模式之間切換，且返回標準模式後地圖仍可操作', async ({ page }) => {
    const modeButton = page.getByRole('button', { name: '地圖模式' })
    await modeButton.click()
    await page.getByRole('menuitemradio', { name: /高效能模式/ }).click()
    await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 10_000 })

    await modeButton.click()
    await page.getByRole('menuitemradio', { name: /標準模式/ }).click()
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.leaflet-control-zoom-in')).toBeVisible()
  })

  test('Leaflet 填入導航起終點後應在開始前畫出規劃路線', async ({ page }) => {
    const requests = await mockReadyDeviceAndNavigationPreview(page)
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 })

    await page.locator('.mode-switcher input[value="navigate"]').evaluate((input: HTMLInputElement) => input.click())
    await page.getByLabel(/Start|起點/).fill('25.0415,121.5438')
    await page.getByLabel(/Destination|End|終點/).fill('25.0408,121.5713')

    const route = page.locator('.leaflet-route-path')
    await expect(route).toHaveCount(1, { timeout: 10_000 })
    await expect(route).toHaveAttribute('d', /L/)
    await expect(page.locator('.leaflet-active-route-path')).toHaveCount(0)
    await expect(page.getByText('2.45 km')).toBeVisible()
    expect(requests.preview).toBe(1)
    expect(requests.start).toBe(0)
  })

  test('導航路線規劃失敗後應可重試且不啟動裝置', async ({ page }) => {
    const requests = await mockReadyDeviceAndNavigationPreview(page)
    const previewUrl = 'http://127.0.0.1:8787/api/navigate/preview'
    await page.unroute(previewUrl)
    let attempts = 0
    await page.route(previewUrl, (route) => {
      attempts += 1
      if (attempts === 1) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'route unavailable' }),
        })
      }
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', route: plannedRoute, distance_m: 2450 }),
      })
    })

    await page.locator('.mode-switcher input[value="navigate"]').evaluate((input: HTMLInputElement) => input.click())
    await page.getByLabel(/Start|起點/).fill('25.0415,121.5438')
    await page.getByLabel(/Destination|End|終點/).fill('25.0408,121.5713')

    const retry = page.getByRole('button', { name: /重新規劃|Plan again/ })
    await expect(retry).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.leaflet-route-path')).toHaveCount(0)
    await retry.click()
    await expect(page.locator('.leaflet-route-path')).toHaveCount(1, { timeout: 10_000 })
    expect(attempts).toBe(2)
    expect(requests.start).toBe(0)
  })

  test('WebGL 填入導航起終點後應在開始前畫出規劃路線', async ({ page }) => {
    const requests = await mockReadyDeviceAndNavigationPreview(page)
    await page.getByRole('button', { name: '地圖模式' }).click()
    await page.getByRole('menuitemradio', { name: /高效能模式/ }).click()
    await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 10_000 })

    await page.locator('.mode-switcher input[value="navigate"]').evaluate((input: HTMLInputElement) => input.click())
    await page.getByLabel(/Start|起點/).fill('25.0415,121.5438')
    await page.getByLabel(/Destination|End|終點/).fill('25.0408,121.5713')
    await expect(page.locator('.maplibregl-marker').filter({ hasText: /^[SE]$/ })).toHaveCount(2, { timeout: 10_000 })
    const route = page.locator('.maplibre-projected-route-overlay .maplibre-route-path')
    await expect(route).toHaveCount(1, { timeout: 10_000 })
    await expect(route.locator('polyline').first()).toHaveAttribute('points', /\S+ \S+ \S+/)
    await expect(page.locator('.maplibre-active-route-path')).toHaveCount(0)
    await expect(page.getByText('2.45 km')).toBeVisible()
    expect(requests.preview).toBe(1)
    expect(requests.start).toBe(0)
  })

  test('保留 Leaflet 起終點並切至 WebGL 後，兩個點位仍會重建', async ({ page }) => {
    await page.locator('.mode-switcher input[value="navigate"]').evaluate((input: HTMLInputElement) => input.click())
    await page.getByLabel(/Start|起點/).fill('25.0415,121.5438')
    await page.getByLabel(/Destination|End|終點/).fill('25.0408,121.5713')
    await expect(page.locator('.leaflet-marker-icon').filter({ hasText: /^[SE]$/ })).toHaveCount(2, { timeout: 10_000 })

    await page.getByRole('button', { name: '地圖模式' }).click()
    await page.getByRole('menuitemradio', { name: /高效能模式/ }).click()
    await expect(page.locator('.maplibregl-marker').filter({ hasText: /^[SE]$/ })).toHaveCount(2, { timeout: 10_000 })
  })

  test('導航預覽從 WebGL 切回 Leaflet 後應保留底圖、起終點與路線', async ({ page }) => {
    await mockReadyDeviceAndNavigationPreview(page)
    await page.locator('.mode-switcher input[value="navigate"]').evaluate((input: HTMLInputElement) => input.click())
    await page.getByLabel(/Start|起點/).fill('25.0415,121.5438')
    await page.getByLabel(/Destination|End|終點/).fill('25.0408,121.5713')
    await expect(page.locator('.leaflet-route-path')).toHaveCount(1, { timeout: 10_000 })

    const modeButton = page.getByRole('button', { name: '地圖模式' })
    await modeButton.click()
    await page.getByRole('menuitemradio', { name: /高效能模式/ }).click()
    await expect(page.locator('.maplibre-projected-route-overlay .maplibre-route-path')).toHaveCount(1, { timeout: 10_000 })
    await expect(page.locator('.maplibregl-marker').filter({ hasText: /^[SE]$/ })).toHaveCount(2)

    await modeButton.click()
    await page.getByRole('menuitemradio', { name: /標準模式/ }).click()
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.leaflet-tile')).not.toHaveCount(0)
    await expect(page.locator('.leaflet-marker-icon').filter({ hasText: /^[SE]$/ })).toHaveCount(2)
    await expect(page.locator('.leaflet-route-path')).toHaveCount(1)
    await expect(page.locator('.leaflet-route-path')).toHaveAttribute('d', /L/)
  })

  test('WebGL 初始載入後不會持續顯示地圖著色狀態', async ({ page }) => {
    await page.getByRole('button', { name: '地圖模式' }).click()
    await page.getByRole('menuitemradio', { name: /高效能模式/ }).click()
    await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.map-tile-loading-badge')).toBeHidden({ timeout: 10_000 })
  })

  test('WebGL 瞬移圖釘尖端應對準選取座標', async ({ page }) => {
    await page.route('http://127.0.0.1:8787/api/devices', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([{
        udid: 'webgl-marker-test-device',
        name: 'WebGL Marker Test Device',
        ios_version: 'test',
        transport: 'lockdown',
        status: 'ready',
        detail: null,
      }]),
    }))
    await page.reload()

    await page.getByRole('button', { name: '地圖模式' }).click()
    await page.getByRole('menuitemradio', { name: /高效能模式/ }).click()
    await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 10_000 })

    const lat = 47.5788
    const lng = 10.7494
    await page.getByPlaceholder('lat, lng or Google Maps URL').fill(`${lat},${lng}`)
    await page.getByRole('button', { name: /預覽|Preview/ }).click()

    const marker = page.locator('.arcwayfarer-selected-point-marker')
    await expect(marker).toHaveCount(1)
    await expect(marker).toHaveCSS('position', 'absolute')

    const delta = await marker.evaluate((element, coordinate) => {
      const map = (window as typeof window & { _maplibreMap: { project: (point: [number, number]) => { x: number; y: number }; getContainer: () => HTMLElement } })._maplibreMap
      const projected = map.project([coordinate.lng, coordinate.lat])
      const mapRect = map.getContainer().getBoundingClientRect()
      const markerRect = element.getBoundingClientRect()
      return {
        x: markerRect.left + markerRect.width / 2 - (mapRect.left + projected.x),
        // The rotated pin's sharp tip is 30px from the wrapper's top edge.
        y: markerRect.top + 30 - (mapRect.top + projected.y),
      }
    }, { lat, lng })

    expect(Math.abs(delta.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(delta.y)).toBeLessThanOrEqual(1)
  })

  test('WebGL 多點巡迴在執行前應畫出完整三點路線', async ({ page }) => {
    await page.getByRole('button', { name: '地圖模式' }).click()
    await page.getByRole('menuitemradio', { name: /高效能模式/ }).click()
    await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 10_000 })

    await page.locator('.mode-switcher input[value="multi-stop"]').evaluate((input: HTMLInputElement) => input.click())
    const waypointInputs = page.locator('.route-loop-waypoint-row input')
    await waypointInputs.nth(0).fill('59.8921,10.5061')
    await waypointInputs.nth(1).fill('59.8875,10.5197')
    await page.getByRole('button', { name: /新增路徑|Add waypoint/i }).click()
    await waypointInputs.nth(2).fill('59.8920,10.5138')

    const fullRoute = page.locator('.maplibre-projected-route-overlay .maplibre-route-path')
    await expect(fullRoute).toHaveCount(1)
    await expect(fullRoute.locator('polyline').first()).toHaveAttribute('points', /\S+ \S+ \S+/)
    await expect(page.locator('.maplibre-active-route-path')).toHaveCount(0)
    await expect(page.locator('.maplibregl-marker').filter({ hasText: /^1$/ })).toHaveCSS('z-index', '1000')
  })

  test('WebGL 隨機漫遊應顯示圓形範圍', async ({ page }) => {
    await page.getByRole('button', { name: '地圖模式' }).click()
    await page.getByRole('menuitemradio', { name: /高效能模式/ }).click()
    await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 10_000 })

    await page.locator('.mode-switcher input[value="random-walk"]').evaluate((input: HTMLInputElement) => input.click())
    await page.getByLabel(/中心點|Center/).fill('51.9260,-3.2444')

    const circle = page.locator('.maplibre-projected-circle')
    await expect(circle).toHaveCount(1)
    await expect(circle).toHaveAttribute('points', /\S+ \S+ \S+/)
    await expect(page.locator('.maplibregl-marker').filter({ hasText: /^C$/ })).toHaveCSS('z-index', '1000')
  })
})
