import { describe, expect, it } from 'vitest'
import { deviceStatusMessage, toUserFacingError } from './userFacingError'

const t = (key: string) => key

describe('user-facing error translation', () => {
  it('does not expose raw technical errors', () => {
    const raw = new Error("Run 'sudo python3 -m pymobiledevice3 remote tunneld'")
    expect(toUserFacingError(raw, '無法與 iPhone 建立定位連線。')).toBe('無法與 iPhone 建立定位連線。')
  })

  it('maps device states to stable product messages', () => {
    expect(deviceStatusMessage({ status: 'tunnel_required', trusted: true }, t as never)).toBe('device.message.location_unavailable')
    expect(deviceStatusMessage({ status: 'error', trusted: false }, t as never)).toBe('device.message.setup_required')
  })
})
