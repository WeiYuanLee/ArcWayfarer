// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PikminPostcardsPanel } from './PikminPostcardsPanel'

const mocks = vi.hoisted(() => ({
  listPikminPostcards: vi.fn(),
  getPikminSyncStatus: vi.fn(),
  startPikminSync: vi.fn(),
  showToast: vi.fn(),
}))

vi.mock('../../services/api', () => ({
  addPikminFavorite: vi.fn(),
  getPikminSyncStatus: mocks.getPikminSyncStatus,
  listPikminPostcards: mocks.listPikminPostcards,
  pikminPostcardImageUrl: (id: number) => `http://127.0.0.1/postcards/${id}/image`,
  startPikminSync: mocks.startPikminSync,
}))
vi.mock('../common/Toast', () => ({ showToast: mocks.showToast }))

const result = {
  items: [{
    id: 519,
    name: '台南安南區-十二佃水月公園',
    type: 'mushroom' as const,
    image_url: 'https://pikmin.talllkai.com/uploads/postcards/deleted.jpg',
    description: '',
    country: '台灣',
    lat: 23.060479,
    lng: 120.191096,
    date: '2026/09/25',
    submitter: '測試者',
    likes: 1,
  }],
  total: 1,
  page: 1,
  page_size: 12,
  countries: ['台灣'],
}

describe('PikminPostcardsPanel source refresh', () => {
  beforeEach(() => {
    mocks.listPikminPostcards.mockReset().mockResolvedValue(result)
    mocks.startPikminSync.mockReset().mockResolvedValue({ status: 'running' })
    mocks.getPikminSyncStatus.mockReset().mockResolvedValue({
      status: 'success',
      counts: { postcards: 539, purespots: 6616 },
      error: null,
    })
    mocks.showToast.mockReset()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('syncs with the source before reloading the postcard list', async () => {
    render(
      <MantineProvider>
        <PikminPostcardsPanel
          favorites={[]}
          onFavoritesChanged={vi.fn()}
          onSelectPoint={vi.fn()}
          onTeleportFavorite={vi.fn()}
          teleportDisabledReason={null}
          teleportingFavoriteId={null}
          teleportDeviceName={null}
        />
      </MantineProvider>,
    )

    await screen.findByText('台南安南區-十二佃水月公園')
    fireEvent.click(screen.getByRole('button', { name: '重新整理' }))

    await waitFor(() => expect(mocks.startPikminSync).toHaveBeenCalledOnce(), { timeout: 2500 })
    await waitFor(() => expect(mocks.getPikminSyncStatus).toHaveBeenCalledOnce(), { timeout: 2500 })
    await waitFor(() => expect(mocks.listPikminPostcards).toHaveBeenCalledTimes(2), { timeout: 2500 })
    expect(mocks.showToast).toHaveBeenCalledWith('已更新來源資料，共 539 張明信片。')
  })
})
