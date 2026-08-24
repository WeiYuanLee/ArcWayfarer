import { expect, test } from '@playwright/test'

const exportDocument = {
  format: 'arcwayfarer-favorites' as const,
  schema_version: 1 as const,
  exported_at: '2026-08-20T00:00:00Z',
  groups: ['Travel'],
  favorites: [{ name: 'Airport', lat: 25.0797, lng: 121.2342, group: 'Travel', notes: 'terminal', created_at: 1, order: 0 }],
}

test.describe('Favorite transfer', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('arcwayfarer.lang', 'zh'))
    await page.route('http://127.0.0.1:8787/api/favorites', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([{ id: 'home', name: 'Home', lat: 25.033, lng: 121.5654, group: '', notes: '', created_at: 1, order: 0 }]),
    }))
    await page.route('http://127.0.0.1:8787/api/favorites/groups', (route) => route.fulfill({
      contentType: 'application/json', body: JSON.stringify(['Travel']),
    }))
    await page.goto('/')
    await page.locator('.favorites-action').click()
    await expect(page.getByRole('dialog', { name: '我的最愛' })).toBeVisible()
  })

  test('可選擇分組匯出 JSON 檔', async ({ page }) => {
    let requestedGroups = ''
    await page.route(/127\.0\.0\.1:8787\/api\/favorites\/export/, (route) => {
      requestedGroups = new URL(route.request().url()).searchParams.getAll('groups').join('|')
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(exportDocument) })
    })

    await page.getByLabel('匯出').click()
    await expect(page.getByRole('dialog', { name: '匯出我的最愛' })).toBeVisible()
    await page.getByRole('checkbox', { name: '未分組' }).uncheck()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: '下載匯出檔' }).click()
    await download
    expect(requestedGroups).toBe('Travel')
  })

  test('匯入會先顯示預覽並在確認後才寫入', async ({ page }) => {
    let importCalls = 0
    await page.route('http://127.0.0.1:8787/api/favorites/import/preview', (route) => route.fulfill({
      contentType: 'application/json', body: JSON.stringify({ total: 2, additions: 1, duplicates: 1, groups_to_add: ['Travel'] }),
    }))
    await page.route('http://127.0.0.1:8787/api/favorites/import', (route) => {
      importCalls += 1
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ total: 2, additions: 1, duplicates: 1, groups_to_add: ['Travel'], imported: 1 }) })
    })

    await page.getByLabel('匯入').click()
    await page.locator('input[type="file"]').setInputFiles({
      name: 'arcwayfarer-favorites.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(exportDocument)),
    })
    await expect(page.getByText('共 2 筆：新增 1 筆、略過重複 1 筆')).toBeVisible()
    expect(importCalls).toBe(0)
    await page.getByRole('button', { name: '確認匯入' }).click()
    await expect(page.getByText('已匯入 1 筆最愛，略過 1 筆重複點位。')).toBeVisible()
    expect(importCalls).toBe(1)
  })
})
