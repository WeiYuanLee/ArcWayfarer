import { test, expect } from '@playwright/test'

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

  test('WebGL 模式填入導航起終點後應顯示兩個地圖點位', async ({ page }) => {
    await page.getByRole('button', { name: '地圖模式' }).click()
    await page.getByRole('menuitemradio', { name: /高效能模式/ }).click()
    await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 10_000 })

    await page.locator('.mode-switcher input[value="navigate"]').evaluate((input: HTMLInputElement) => input.click())
    await page.getByLabel(/Start|起點/).fill('25.0415,121.5438')
    await page.getByLabel(/Destination|End|終點/).fill('25.0408,121.5713')
    await expect(page.locator('.maplibregl-marker').filter({ hasText: /^[SE]$/ })).toHaveCount(2, { timeout: 10_000 })
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

  test('WebGL 初始載入後不會持續顯示地圖著色狀態', async ({ page }) => {
    await page.getByRole('button', { name: '地圖模式' }).click()
    await page.getByRole('menuitemradio', { name: /高效能模式/ }).click()
    await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.map-tile-loading-badge')).toBeHidden({ timeout: 10_000 })
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
  })
})
