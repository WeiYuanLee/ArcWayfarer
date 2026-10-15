// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearQuickReconnectRecord,
  getQuickReconnectRecords,
  saveQuickReconnectRecord,
  startFlower,
  type QuickReconnectRecord,
} from './api'

const record = (udid: string, ip: string, timestamp: string): QuickReconnectRecord => ({
  udid,
  name: `Phone ${udid}`,
  endpoint: `${ip}:49152`,
  ip,
  port: 49152,
  timestamp,
})

describe('Wireless Direct quick reconnect history', () => {
  beforeEach(() => clearQuickReconnectRecord())

  it('reads the previous single-record storage format', () => {
    const legacy = record('A', '192.168.1.10', '2026-09-20 01:00')
    localStorage.setItem('arcwayfarer.quick_reconnect', JSON.stringify(legacy))

    expect(getQuickReconnectRecords()).toEqual([legacy])
  })

  it('keeps only the two most recently connected devices', () => {
    const first = record('A', '192.168.1.10', '2026-09-20 01:00')
    const second = record('B', '192.168.1.11', '2026-09-20 02:00')
    const third = record('C', '192.168.1.12', '2026-09-20 03:00')

    saveQuickReconnectRecord(first)
    saveQuickReconnectRecord(second)

    expect(saveQuickReconnectRecord(third)).toEqual([third, second])
    expect(getQuickReconnectRecords()).toEqual([third, second])
  })

  it('updates and promotes an existing device without duplicating it', () => {
    const first = record('A', '192.168.1.10', '2026-09-20 01:00')
    const second = record('B', '192.168.1.11', '2026-09-20 02:00')
    const moved = record('a', '192.168.2.20', '2026-09-20 03:00')

    saveQuickReconnectRecord(first)
    saveQuickReconnectRecord(second)

    expect(saveQuickReconnectRecord(moved)).toEqual([moved, second])
  })
})

describe('Flower start position', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the selected zero-based flower index', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', route: [], legs: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await startFlower(
      'device-1',
      'walk',
      [{ lat: 25, lng: 121 }, { lat: 25.01, lng: 121.01 }],
      {
        radius_m: 30,
        circles: 1,
        segments: 16,
        path_strategy: 'center_spiral',
        inner_radius_m: null,
        jitter_m: 1.5,
        pre_wait_seconds: 0,
        post_wait_seconds: 2,
        route_type: 'stop_at_end',
        rounds: 1,
      },
      { startIndex: 1 },
    )

    const request = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(request.body as string)).toMatchObject({ mode: 'flower', start_index: 1 })
  })
})
