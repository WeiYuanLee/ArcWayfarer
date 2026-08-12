import { test, expect } from '@playwright/test'

test.describe('MultiStop Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.locator('.leaflet-container').waitFor({ timeout: 10_000 })

    // 切換到多點巡迴模式
    const multiStopBtn = page.locator('.capsule-item', { hasText: '多點巡迴' })
    await multiStopBtn.click()
  })

  test('多點巡迴面板應顯示', async ({ page }) => {
    await expect(page.locator('.panel').first()).toBeVisible()
  })

  test('應顯示新增路徑點按鈕', async ({ page }) => {
    const addBtn = page.locator('.swap-button', { hasText: '新增路徑' })
    await expect(addBtn.first()).toBeVisible()
  })

  test('點擊新增路徑點後應新增一列', async ({ page }) => {
    const addBtn = page.locator('.swap-button', { hasText: '新增路徑' })

    // 初始狀態
    const initialRows = await page.locator('.coord-row').count()

    await addBtn.first().click()

    // 應多出一列
    await expect(page.locator('.coord-row')).toHaveCount(initialRows + 1)
  })

  test('應顯示清除全部按鈕', async ({ page }) => {
    const clearBtn = page.locator('.swap-button', { hasText: '清除' })
    await expect(clearBtn.first()).toBeVisible()
  })
})
