// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MultiStopPanel } from './MultiStopPanel'
import type { PanelProps } from './types'

const mocks = vi.hoisted(() => {
  const points = [
    { lat: 25, lng: 121 },
    { lat: 25.02, lng: 121.02 },
    { lat: 25.01, lng: 121.01 },
  ]
  const items = points.map((point, index) => ({ id: String(index), point, rawText: `${point.lat}, ${point.lng}` }))
  return {
    points,
    items,
    optimizeRouteOrder: vi.fn(),
    reorderValidWaypoints: vi.fn(() => 1),
    restoreItems: vi.fn(() => 2),
    showToast: vi.fn(),
  }
})

vi.mock('../../i18n', () => ({ useT: () => (key: string) => key }))
vi.mock('../common/Toast', () => ({ showToast: mocks.showToast }))
vi.mock('./routeOptimizer', () => ({
  MAX_OPTIMIZABLE_POINTS: 500,
  optimizeRouteOrder: mocks.optimizeRouteOrder,
}))
vi.mock('../../hooks/useWaypointList', () => ({
  useWaypointList: () => ({
    items: mocks.items,
    revision: 1,
    validWaypoints: mocks.points,
    updateWaypoint: vi.fn(),
    handleTextChange: vi.fn(),
    addWaypoint: vi.fn(),
    insertWaypointAfter: vi.fn(),
    removeWaypoint: vi.fn(),
    moveWaypoint: vi.fn(),
    clearAllWaypoints: vi.fn(),
    setAllWaypoints: vi.fn(),
    reorderValidWaypoints: mocks.reorderValidWaypoints,
    restoreItems: mocks.restoreItems,
  }),
}))

const changedResult = {
  order: [0, 2, 1],
  originalDistance: 4000,
  optimizedDistance: 3000,
  savedDistance: 1000,
  wasLimited: false,
}
const unchangedResult = {
  order: [0, 1, 2],
  originalDistance: 3000,
  optimizedDistance: 3000,
  savedDistance: 0,
  wasLimited: false,
}

const defaultProps: PanelProps = {
  deviceId: 'dev-1',
  device: { status: 'ready', detail: '' } as any,
  deviceState: 'idle',
  point: null,
  livePosition: null,
  liveEtaSeconds: null,
  liveStopIndex: null,
  setPoint: vi.fn(),
  connected: true,
  requestPoint: vi.fn(),
  clearPoint: vi.fn(),
  setOverlay: vi.fn(),
  requestFlyTo: vi.fn(),
  sendWs: vi.fn(),
}

describe('MultiStopPanel route optimization lifecycle', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.optimizeRouteOrder.mockReset()
    mocks.reorderValidWaypoints.mockClear()
    mocks.restoreItems.mockClear()
    mocks.showToast.mockClear()
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
    localStorage.clear()
  })

  it('keeps the existing Undo after a second no-op optimization', () => {
    mocks.optimizeRouteOrder.mockReturnValueOnce(changedResult).mockReturnValueOnce(unchangedResult)
    render(<MantineProvider><MultiStopPanel {...defaultProps} /></MantineProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'multistop.optimize_order' }))
    expect(screen.getByRole('button', { name: 'multistop.undo_optimize' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'multistop.optimize_order' }))
    expect(screen.getByRole('button', { name: 'multistop.undo_optimize' })).toBeDefined()
    expect(mocks.showToast).toHaveBeenCalledWith('multistop.optimize_no_change')
  })

  it('clears Undo when the editor mode or Flower route type changes', () => {
    mocks.optimizeRouteOrder.mockReturnValue(changedResult)
    render(<MantineProvider><MultiStopPanel {...defaultProps} /></MantineProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'multistop.optimize_order' }))
    fireEvent.click(screen.getByText('種花模式'))
    expect(screen.queryByRole('button', { name: 'multistop.undo_optimize' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'multistop.optimize_order' }))
    expect(screen.getByRole('button', { name: 'multistop.undo_optimize' })).toBeDefined()
    fireEvent.click(screen.getByText('回到起點'))
    expect(screen.queryByRole('button', { name: 'multistop.undo_optimize' })).toBeNull()
  })

  it('does not render optimization controls while a route is active', () => {
    render(<MantineProvider><MultiStopPanel {...defaultProps} deviceState="navigating" /></MantineProvider>)

    expect(screen.queryByRole('button', { name: 'multistop.optimize_order' })).toBeNull()
  })
})
