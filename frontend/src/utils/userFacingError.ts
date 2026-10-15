import type { StringKey } from '../i18n'
import type { Device } from '../services/api'

type Translate = (key: StringKey) => string

/**
 * Never let raw backend, transport or third-party exception text reach the UI.
 * Callers provide a localized, operation-specific fallback that tells the user
 * what failed without exposing Python commands, HTTP payloads or stack details.
 */
export function toUserFacingError(_error: unknown, fallback: string): string {
  return fallback
}

/** Convert device discovery state into stable localized product language. */
export function deviceStatusMessage(device: Pick<Device, 'status' | 'trusted'>, t: Translate): string {
  if (device.status === 'discovering' || device.status === 'mounting') {
    return t('device.message.preparing')
  }
  if (device.trusted === false) return t('device.message.setup_required')
  if (device.status === 'tunnel_required') return t('device.message.location_unavailable')
  return t('device.message.unavailable')
}
