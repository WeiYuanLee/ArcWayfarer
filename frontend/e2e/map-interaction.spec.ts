import { test, expect } from '@playwright/test'

test.describe('Map Interaction', () => {
  test.beforeEach(async ({ page }) => {
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
    await expect(page.locator('.cyber-hud-statusbar')).toBeVisible()
  })

  test('地圖應包含縮放控制按鈕', async ({ page }) => {
    await page.locator('.leaflet-container').waitFor({ timeout: 10_000 })
    const zoomIn = page.locator('.leaflet-control-zoom-in')
    await expect(zoomIn).toBeVisible()
  })
})
