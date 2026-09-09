// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWebSocket } from './useWebSocket'

class FakeWebSocket {
  static OPEN = 1
  static instances: FakeWebSocket[] = []
  readyState = FakeWebSocket.OPEN
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  sent: string[] = []

  constructor(_url: string) {
    FakeWebSocket.instances.push(this)
  }

  send(message: string) {
    this.sent.push(message)
  }

  close() {
    this.readyState = 3
    this.onclose?.()
  }

  emit(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

describe('useWebSocket background recovery', () => {
  let visibility: DocumentVisibilityState
  let originalWebSocket: typeof WebSocket

  beforeEach(() => {
    visibility = 'visible'
    FakeWebSocket.instances = []
    originalWebSocket = globalThis.WebSocket
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
  })

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket
    vi.restoreAllMocks()
  })

  it('keeps only the latest visual telemetry while hidden and flushes it on restore', () => {
    const { result, unmount } = renderHook(() => useWebSocket())
    const socket = FakeWebSocket.instances[0]

    act(() => {
      visibility = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))
      socket.emit({ type: 'position', udid: 'device-1', lat: 25, lng: 121, speed_mps: 1, eta_seconds: 10, stop_index: 1 })
      socket.emit({ type: 'position', udid: 'device-1', lat: 26, lng: 122, speed_mps: 2, eta_seconds: 5, stop_index: 2 })
      socket.emit({ type: 'flower_progress', udid: 'device-1', flower_index: 2, phase: 'circle', eta_seconds: 5 })
    })

    expect(result.current.positions).toEqual({})
    expect(result.current.flowerProgress).toEqual({})

    act(() => {
      visibility = 'visible'
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(result.current.positions['device-1']).toMatchObject({ lat: 26, lng: 122, speedMps: 2, etaSeconds: 5 })
    expect(result.current.flowerProgress['device-1']).toMatchObject({ flowerIndex: 2, phase: 'circle', etaSeconds: 5 })
    unmount()
  })

  it('does not discard control state changes while hidden', () => {
    const { result, unmount } = renderHook(() => useWebSocket())
    const socket = FakeWebSocket.instances[0]

    act(() => {
      visibility = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))
      socket.emit({ type: 'state', udid: 'device-1', state: 'paused' })
    })

    expect(result.current.states['device-1']).toBe('paused')
    unmount()
  })

  it('retains semantic flower config from an authoritative snapshot', () => {
    const { result, unmount } = renderHook(() => useWebSocket())
    const socket = FakeWebSocket.instances[0]

    act(() => socket.emit({
      type: 'status_snapshot', positions: [], states: [], flower_progress: [],
      tasks: [{
        udid: 'device-1', state: 'navigating', kind: 'flower', path: [],
        task_id: 'flower-task', revision: 4, protocol_version: 2,
        config: {
          waypoints: [{ lat: 25, lng: 121 }], nav_mode: 'walk',
          flower: { radius_m: 30, circles: 1, segments: 16, path_strategy: 'center_spiral', pre_wait_seconds: 0, post_wait_seconds: 2, route_type: 'loop_forever', rounds: 'infinite' },
        },
      }],
    }))

    expect(result.current.activeTasks['device-1']).toMatchObject({
      kind: 'flower', taskId: 'flower-task', revision: 4,
      config: { waypoints: [{ lat: 25, lng: 121 }], flower: { route_type: 'loop_forever' } },
    })
    unmount()
  })
})
