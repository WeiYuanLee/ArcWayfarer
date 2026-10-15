// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TeleportPanel } from './TeleportPanel'
import type { PanelProps } from './types'

const mocks = vi.hoisted(() => ({
  clearLocation: vi.fn(),
  finishGoldDitto: vi.fn(),
  goldDitto: vi.fn(),
  pushHistory: vi.fn(),
  setLocation: vi.fn(),
  notify: { failure: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))

vi.mock('../../services/api', () => ({
  clearLocation: mocks.clearLocation,
  finishGoldDitto: mocks.finishGoldDitto,
  goldDitto: mocks.goldDitto,
  pushHistory: mocks.pushHistory,
  setLocation: mocks.setLocation,
}))
vi.mock('../../i18n', () => ({ useT: () => (key: string) => key }))
vi.mock('../common/Toast', () => ({ notify: mocks.notify, showToast: vi.fn() }))

describe('TeleportPanel Gold Ditto workflow', () => {
  beforeEach(() => {
    ;[mocks.clearLocation, mocks.finishGoldDitto, mocks.goldDitto, mocks.pushHistory, mocks.setLocation]
      .forEach((mock) => mock.mockReset())
    Object.values(mocks.notify).forEach((mock) => mock.mockReset())
    mocks.goldDitto.mockResolvedValue(undefined)
    mocks.finishGoldDitto.mockResolvedValue(undefined)
    mocks.pushHistory.mockResolvedValue(undefined)
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
  })

  afterEach(cleanup)

  const defaultProps: PanelProps = {
    deviceId: 'dev-1',
    device: { status: 'ready', detail: '' } as any,
    deviceState: 'idle',
    point: { lat: 22.018622, lng: 120.850098 },
    livePosition: null,
    liveEtaSeconds: null,
    liveStopIndex: null,
    setPoint: vi.fn(),
    requestPoint: vi.fn(),
    clearPoint: vi.fn(),
    setOverlay: vi.fn(),
    requestFlyTo: vi.fn(),
    sendWs: vi.fn(),
  }

  it('starts by holding at the flower instead of auto-restoring', async () => {
    render(<MantineProvider><TeleportPanel {...defaultProps} /></MantineProvider>)
    fireEvent.click(screen.getByText('teleport.goldditto.title'))
    fireEvent.click(screen.getByText('teleport.goldditto.action.start'))

    await waitFor(() => expect(mocks.goldDitto).toHaveBeenCalledWith('dev-1', 22.018622, 120.850098, null))
    expect(mocks.finishGoldDitto).not.toHaveBeenCalled()
    expect(mocks.notify.info).toHaveBeenCalledWith(
      'teleport.goldditto.status.waiting',
      { id: 'gold-ditto:start:dev-1' },
    )
  }, 15000)

  it('recovers an in-progress hold from device state and runs the finish phase', async () => {
    render(
      <MantineProvider>
        <TeleportPanel {...defaultProps} deviceState="gold_ditto" />
      </MantineProvider>,
    )

    expect(await screen.findByText('teleport.goldditto.guide.holding.title')).toBeDefined()
    const finishButton = await screen.findByText('teleport.goldditto.action.restore')
    fireEvent.click(finishButton)

    await waitFor(() => expect(mocks.finishGoldDitto).toHaveBeenCalledWith('dev-1'))
    expect(mocks.goldDitto).not.toHaveBeenCalled()
  }, 15000)

  it('shows the original real position on the map while Gold Ditto is selected', async () => {
    const setOverlay = vi.fn()
    render(
      <MantineProvider>
        <TeleportPanel
          {...defaultProps}
          livePosition={{ lat: 24.7755, lng: 121.0107 }}
          setOverlay={setOverlay}
        />
      </MantineProvider>,
    )

    fireEvent.click(screen.getByText('teleport.goldditto.title'))

    await waitFor(() => {
      const overlay = [...setOverlay.mock.calls]
        .reverse()
        .map(([value]) => value)
        .find((value) => value.markers?.some((marker: { id: string }) => marker.id === 'gold-origin'))
      expect(overlay?.markers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'gold-origin',
          lat: 24.7755,
          lng: 121.0107,
          color: '#2f9e44',
          label: 'teleport.goldditto.map.origin_marker',
          draggable: true,
        }),
      ]))
      expect(overlay?.links).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'gold-origin-to-target' }),
      ]))
    })
  }, 15000)

  it('shows one success notification when the restore event follows the button action', async () => {
    const { rerender } = render(
      <MantineProvider>
        <TeleportPanel {...defaultProps} />
      </MantineProvider>,
    )

    fireEvent.click(screen.getByText('teleport.action.clear'))
    await waitFor(() => expect(mocks.notify.success).toHaveBeenCalledOnce())

    rerender(
      <MantineProvider>
        <TeleportPanel {...defaultProps} restoredAt={Date.now()} />
      </MantineProvider>,
    )

    expect(mocks.notify.success).toHaveBeenCalledOnce()
    expect(mocks.notify.success).toHaveBeenCalledWith(
      'teleport.status.clear_success',
      { id: 'teleport:clear:dev-1' },
    )
  })
})
