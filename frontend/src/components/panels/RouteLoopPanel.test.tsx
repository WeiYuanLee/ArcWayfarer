// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouteLoopPanel } from './RouteLoopPanel'
import type { PanelProps } from './types'

const mocks = vi.hoisted(() => ({
  setAllWaypoints: vi.fn(),
  setOverlay: vi.fn(),
}))

vi.mock('../../i18n', () => ({ useT: () => (key: string) => key }))
vi.mock('../common/Toast', () => ({
  notify: { error: vi.fn(), failure: vi.fn(), success: vi.fn(), warning: vi.fn() },
  showToast: vi.fn(),
}))
vi.mock('./RouteLibraryButton', () => ({ RouteLibraryButton: () => null }))
vi.mock('../../hooks/useWaypointList', () => ({
  useWaypointList: () => ({
    items: [
      { id: '1', point: null, rawText: '' },
      { id: '2', point: null, rawText: '' },
    ],
    validWaypoints: [],
    updateWaypoint: vi.fn(),
    handleTextChange: vi.fn(),
    addWaypoint: vi.fn(),
    removeWaypoint: vi.fn(),
    reorderWaypoint: vi.fn(),
    clearAllWaypoints: vi.fn(),
    setAllWaypoints: mocks.setAllWaypoints,
    reverseWaypoints: vi.fn(),
    setAsStart: vi.fn(),
  }),
}))

const defaultProps: PanelProps = {
  deviceId: 'device-a',
  device: { udid: 'device-a', name: 'Runner', status: 'ready' } as any,
  deviceState: 'looping',
  point: null,
  livePosition: { lat: 25.005, lng: 121.005 },
  liveSpeedMps: 1,
  liveEtaSeconds: 30,
  liveStopIndex: 1,
  activeTask: {
    kind: 'route_loop',
    taskId: 'loop-a',
    revision: 1,
    path: [
      { lat: 25, lng: 121 },
      { lat: 25.01, lng: 121.01 },
      { lat: 25, lng: 121 },
    ],
    config: {
      waypoints: [{ lat: 25, lng: 121 }, { lat: 25.01, lng: 121.01 }],
      nav_mode: 'bike',
      pause_enabled: true,
      pause_min: 3,
      pause_max: 7,
      straight_line: true,
      custom_speed_kmh: 18,
    },
  },
  connected: true,
  setPoint: vi.fn(),
  requestPoint: vi.fn(),
  clearPoint: vi.fn(),
  setOverlay: mocks.setOverlay,
  requestFlyTo: vi.fn(),
  sendWs: vi.fn(),
}

describe('RouteLoopPanel active task recovery', () => {
  beforeEach(() => {
    mocks.setAllWaypoints.mockClear()
    mocks.setOverlay.mockClear()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
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

  afterEach(() => cleanup())

  it('restores waypoints and map geometry after the device panel remounts', async () => {
    render(<MantineProvider><RouteLoopPanel {...defaultProps} /></MantineProvider>)

    await waitFor(() => expect(mocks.setAllWaypoints).toHaveBeenCalledWith(defaultProps.activeTask?.config?.waypoints))
    await waitFor(() => expect(mocks.setOverlay).toHaveBeenLastCalledWith(expect.objectContaining({
      path: defaultProps.activeTask?.path,
    })))
  })
})
