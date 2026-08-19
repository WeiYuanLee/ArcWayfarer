import { test, expect } from '@playwright/test'

test.describe('Joystick Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('arcwayfarer.lang', 'zh'))
    await page.goto('/')
    await page.locator('.leaflet-container').waitFor({ timeout: 10_000 })

    // 切換到搖桿模式
    await page.locator('.mode-switcher input[value="joystick"]').evaluate((input: HTMLInputElement) => input.click())
  })

  test('搖桿面板應顯示', async ({ page }) => {
    await expect(page.locator('.panel').first()).toBeVisible()
  })

  test('應顯示固定速度與動態模式分頁', async ({ page }) => {
    await expect(page.getByText('固定速度', { exact: true })).toBeVisible()
    await expect(page.getByText('動態模式', { exact: true })).toBeVisible()
  })

  test('點擊動態模式分頁應切換', async ({ page }) => {
    const dynamicTab = page.locator('.panel input[value="dynamic"]')
    await dynamicTab.evaluate((input: HTMLInputElement) => input.click())
    await expect(dynamicTab).toBeChecked()
  })

  test('尚未啟動時不應顯示搖桿浮動底座', async ({ page }) => {
    await expect(page.locator('.joystick-float-dock')).not.toBeVisible()
  })
})
