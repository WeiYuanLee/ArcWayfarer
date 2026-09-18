import { test, expect } from '@playwright/test'

test.describe('MultiStop Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('arcwayfarer.lang', 'zh'))
    await page.route('http://127.0.0.1:8787/api/devices', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([{ udid: 'route-panel-test-device', name: 'Test iPhone', ios_version: 'test', transport: 'lockdown', status: 'ready', detail: null }]),
    }))
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
    await expect(addBtn).toBeVisible()

    // 初始狀態
    const initialRows = await page.locator('.route-loop-waypoint-row').count()

    await addBtn.click()

    // 應多出一列
    await expect(page.locator('.route-loop-waypoint-row')).toHaveCount(initialRows + 1)
  })

  test('應顯示全清點位按鈕', async ({ page }) => {
    await expect(page.getByRole('button', { name: '全清點位' })).toBeVisible()
  })

  test('窄視窗中的基礎模式可捲動且開始按鈕保持可見', async ({ page }) => {
    await page.setViewportSize({ width: 596, height: 700 })
    const scrollViewport = page.locator('.multistop-panel--editor .mantine-ScrollArea-viewport')
    await expect(scrollViewport).toBeVisible()

    const dimensions = await scrollViewport.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }))
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight)

    await scrollViewport.evaluate((element) => { element.scrollTop = element.scrollHeight })
    await expect.poll(() => scrollViewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await expect(page.getByRole('button', { name: '開始' })).toBeVisible()
  })
})

test.describe('Route Loop Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('arcwayfarer.lang', 'zh'))
    await page.route('http://127.0.0.1:8787/api/devices', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        { udid: 'route-loop-test-device', name: 'Test iPhone', ios_version: 'test', transport: 'lockdown', status: 'ready', detail: null },
        { udid: 'route-loop-second-device', name: 'Second iPhone', ios_version: 'test', transport: 'lockdown', status: 'ready', detail: null },
      ]),
    }))
    await page.goto('/')
    await page.locator('.leaflet-container').waitFor({ timeout: 10_000 })
    await page.locator('.mode-switcher input[value="route-loop"]').evaluate((input: HTMLInputElement) => input.click())
  })

  test('可貼上多個座標建立循環路徑', async ({ page }) => {
    await page.getByRole('button', { name: '貼上座標' }).click()
    await page.getByPlaceholder(/每行一組座標/).fill('25.033, 121.565\n25.041, 121.557\n25.047, 121.551')
    await page.getByRole('button', { name: '套用' }).click()

    const rows = page.locator('.route-loop-waypoint-row')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0).locator('input')).toHaveValue('25.0330,121.5650')
    await expect(rows.nth(2).locator('input')).toHaveValue('25.0470,121.5510')
  })

  test('數字欄位保留全形或文字輸入並顯示驗證錯誤', async ({ page }) => {
    await page.getByText('圖案路徑', { exact: true }).click()
    const sizeInput = page.getByLabel('圖案大小（公里）')

    await sizeInput.fill('０．２公里')

    await expect(sizeInput).toHaveValue('０．２公里')
    await expect(page.getByText('請輸入有效的半形數字。')).toBeVisible()
    await expect(sizeInput).toHaveAttribute('aria-invalid', 'true')
  })

  test('貼上座標覆蓋既有循環路徑前需要確認', async ({ page }) => {
    await page.getByRole('button', { name: '貼上座標' }).click()
    await page.getByPlaceholder(/每行一組座標/).fill('25.033, 121.565\n25.041, 121.557')
    await page.getByRole('button', { name: '套用' }).click()

    await page.getByRole('button', { name: '貼上座標' }).click()
    await page.getByPlaceholder(/每行一組座標/).fill('24.100, 120.600\n24.200, 120.700')
    await page.getByRole('button', { name: '套用' }).click()

    await expect(page.getByText('貼上並覆蓋現有路線？')).toBeVisible()
    await page.getByRole('button', { name: '取消' }).last().click()
    await expect(page.locator('.route-loop-waypoint-row').nth(0).locator('input')).toHaveValue('25.0330,121.5650')

    await page.getByRole('button', { name: '套用' }).click()
    await page.getByRole('button', { name: '確認' }).click()
    await expect(page.locator('.route-loop-waypoint-row').nth(0).locator('input')).toHaveValue('24.1000,120.6000')
  })

  test('裝置進度卡應顯示在模式切換列上方', async ({ page }) => {
    const deviceTab = page.locator('.device-tab').first()
    await deviceTab.hover()

    const hoverCard = page.locator('.device-tab-hover-card')
    await expect(hoverCard).toBeVisible()
    await expect(hoverCard).toContainText('UDID: route-loop-test-device')
    await expect(deviceTab).not.toHaveAttribute('title')

    const overlapHasProtectedStacking = await page.evaluate(() => {
      const card = document.querySelector('.device-tab-hover-card')?.getBoundingClientRect()
      const switcher = document.querySelector('.mode-switcher')?.getBoundingClientRect()
      const topBar = document.querySelector('.top-bar')
      const appBody = document.querySelector('.app-body')
      if (!card || !switcher || !topBar || !appBody) return false
      const left = Math.max(card.left, switcher.left)
      const right = Math.min(card.right, switcher.right)
      const top = Math.max(card.top, switcher.top)
      const bottom = Math.min(card.bottom, switcher.bottom)
      if (left >= right || top >= bottom) return false
      return Number(getComputedStyle(topBar).zIndex) > Number(getComputedStyle(appBody).zIndex)
    })
    expect(overlapHasProtectedStacking).toBe(true)
  })
})

test('執行中的巡迴面板不受其他裝置的編輯器高度影響', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.addInitScript(() => localStorage.setItem('arcwayfarer.lang', 'zh'))
  await page.route('http://127.0.0.1:8787/api/devices', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([
      { udid: 'editor-device', name: 'Editor', ios_version: 'test', transport: 'lockdown', status: 'ready', detail: null },
      { udid: 'running-device', name: 'Runner', ios_version: 'test', transport: 'lockdown', status: 'ready', detail: null },
    ]),
  }))
  let sendSnapshot: (() => void) | undefined
  await page.routeWebSocket('ws://127.0.0.1:8787/ws/status', (ws) => {
    sendSnapshot = () => ws.send(JSON.stringify({
      type: 'status_snapshot',
      tasks: [{
        udid: 'running-device', state: 'navigating', kind: 'flower', path: [],
        config: { waypoints: [{ lat: 25.03, lng: 121.56 }, { lat: 25.04, lng: 121.57 }] },
      }],
      positions: [],
      states: [],
      flower_progress: [{ udid: 'running-device', flower_index: 1, total_flowers: 2, circle: 1, total_circles: 1, phase: 'circle', eta_seconds: 60 }],
    }))
  })

  await page.goto('/')
  await page.locator('.leaflet-container').waitFor({ timeout: 10_000 })
  await page.locator('.mode-switcher input[value="multi-stop"]').evaluate((input: HTMLInputElement) => input.click())
  await expect(page.locator('.device-panel-workspace--focused .multistop-panel--editor')).toBeVisible()
  await page.getByRole('button', { name: 'Runner, UDID: running-device' }).click()
  await page.locator('.mode-switcher input[value="multi-stop"]').evaluate((input: HTMLInputElement) => input.click())
  await expect.poll(() => Boolean(sendSnapshot)).toBe(true)
  sendSnapshot!()

  await expect(page.locator('.device-panel-workspace--focused .flower-flight-hud')).toBeVisible()
  await expect(page.locator('.device-panel-workspace--focused .multistop-panel--editor')).toHaveCount(0)
  await expect.poll(() => page.locator('.overlay-panel-card').evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(400)
})
