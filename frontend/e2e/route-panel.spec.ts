import { test, expect } from '@playwright/test'

test.describe('MultiStop Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('arcwayfarer.lang', 'zh'))
    await page.goto('/')
    await page.locator('.leaflet-container').waitFor({ timeout: 10_000 })

    // 切換到多點巡迴模式
    await page.locator('.mode-switcher input[value="multi-stop"]').evaluate((input: HTMLInputElement) => input.click())
  })

  test('多點巡迴面板應顯示', async ({ page }) => {
    await expect(page.locator('.panel').first()).toBeVisible()
  })

  test('應顯示新增路徑點按鈕', async ({ page }) => {
    await expect(page.getByRole('button', { name: '新增路徑' })).toBeVisible()
  })

  test('點擊新增路徑點後應新增一列', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: '新增路徑' })

    // 初始狀態
    const initialRows = await page.locator('.route-loop-waypoint-row').count()

    await addBtn.click()

    // 應多出一列
    await expect(page.locator('.route-loop-waypoint-row')).toHaveCount(initialRows + 1)
  })

  test('應顯示全清點位按鈕', async ({ page }) => {
    await expect(page.getByRole('button', { name: '全清點位' })).toBeVisible()
  })
})
