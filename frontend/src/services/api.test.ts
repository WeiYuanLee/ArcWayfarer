// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearQuickReconnectRecord,
  getQuickReconnectRecords,
  saveQuickReconnectRecord,
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
