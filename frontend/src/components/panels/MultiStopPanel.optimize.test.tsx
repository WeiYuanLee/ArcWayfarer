// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    setAllWaypoints: vi.fn(),
    notify: {
      action: vi.fn(), error: vi.fn(), failure: vi.fn(), hide: vi.fn(),
      info: vi.fn(), success: vi.fn(), warning: vi.fn(),
    },
    showToast: vi.fn(),
    writeText: vi.fn(),
    translate: (key: string) => key,
  }
})

vi.mock('../../i18n', () => ({ useT: () => mocks.translate }))
vi.mock('../common/Toast', () => ({ notify: mocks.notify, showToast: mocks.showToast }))
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
    reorderWaypoint: vi.fn(),
    clearAllWaypoints: vi.fn(),
    setAllWaypoints: mocks.setAllWaypoints,
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
    mocks.setAllWaypoints.mockClear()
    mocks.showToast.mockClear()
    Object.values(mocks.notify).forEach((mock) => mock.mockClear())
    mocks.writeText.mockReset().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mocks.writeText },
    })
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
    expect(mocks.notify.action).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'multistop.optimize_order' }))
    expect(mocks.notify.action).toHaveBeenCalledOnce()
    expect(mocks.notify.info).toHaveBeenCalledWith('multistop.optimize_no_change')
  })

  it('clears Undo when the editor mode or Flower route type changes', () => {
    mocks.optimizeRouteOrder.mockReturnValue(changedResult)
    render(<MantineProvider><MultiStopPanel {...defaultProps} /></MantineProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'multistop.optimize_order' }))
    fireEvent.click(screen.getByText('種花模式'))
    expect(mocks.notify.hide).toHaveBeenCalledWith('route-optimize:dev-1')

    fireEvent.click(screen.getByRole('button', { name: 'multistop.optimize_order' }))
    expect(mocks.notify.action).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByText('回到起點'))
    expect(mocks.notify.hide).toHaveBeenLastCalledWith('route-optimize:dev-1')
  })

  it('does not render optimization controls while a route is active', () => {
    render(<MantineProvider><MultiStopPanel {...defaultProps} deviceState="navigating" /></MantineProvider>)

    expect(screen.queryByRole('button', { name: 'multistop.optimize_order' })).toBeNull()
  })

  it('copies every valid waypoint in order from the export menu', async () => {
    render(<MantineProvider><MultiStopPanel {...defaultProps} /></MantineProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'multistop.export' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'multistop.export_coordinates' }))

    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith([
      '25.000000, 121.000000',
      '25.020000, 121.020000',
      '25.010000, 121.010000',
    ].join('\n')))
    expect(mocks.notify.success).toHaveBeenCalledWith('multistop.export_coordinates_success')
  })

  it('loads only coordinates and switches submode for a cross-mode Flower import', async () => {
    const clearSavedRouteImport = vi.fn()
    const route = {
      id: 'route-1',
      name: '公園循環',
      source_mode: 'route_loop' as const,
      waypoints: [{ lat: 25.03, lng: 121.53 }, { lat: 25.04, lng: 121.54 }],
      runtime_config: { speed_kmh: 12 },
      created_at: 1,
      updated_at: 1,
    }
    render(
      <MantineProvider>
        <MultiStopPanel
          {...defaultProps}
          savedRouteImport={{ requestId: 7, route, targetMode: 'flower' }}
          clearSavedRouteImport={clearSavedRouteImport}
        />
      </MantineProvider>,
    )

    await waitFor(() => expect(mocks.setAllWaypoints).toHaveBeenCalledWith(route.waypoints))
    expect(clearSavedRouteImport).toHaveBeenCalledWith('dev-1', 7)
    expect(mocks.notify.warning).toHaveBeenCalledWith(
      'route_library.loaded_coordinates',
      { id: 'route-load:dev-1' },
    )
    expect(screen.getAllByText('種花模式').length).toBeGreaterThan(0)
  })
})
