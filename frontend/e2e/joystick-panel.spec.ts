import { test, expect } from '@playwright/test'

test.describe('Joystick Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('arcwayfarer.lang', 'zh'))
    await page.goto('/')
    await page.locator('.leaflet-container').waitFor({ timeout: 10_000 })

    // 切換到搖桿模式
    const joystickBtn = page.locator('.capsule-item', { hasText: '搖桿' })
    await joystickBtn.click()
  })

  test('搖桿面板應顯示', async ({ page }) => {
    await expect(page.locator('.panel').first()).toBeVisible()
  })

  test('應顯示固定速度與動態模式分頁', async ({ page }) => {
    await expect(page.locator('.sub-tab', { hasText: '固定速度' })).toBeVisible()
    await expect(page.locator('.sub-tab', { hasText: '動態模式' })).toBeVisible()
  })

  test('點擊動態模式分頁應切換', async ({ page }) => {
    const dynamicTab = page.locator('.sub-tab', { hasText: '動態模式' })
    await dynamicTab.click()
    await expect(dynamicTab).toHaveClass(/active/)
  })

  test('尚未啟動時不應顯示搖桿浮動底座', async ({ page }) => {
    await expect(page.locator('.joystick-float-dock')).not.toBeVisible()
  })
})
