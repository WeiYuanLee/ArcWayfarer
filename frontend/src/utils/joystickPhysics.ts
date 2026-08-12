/**
 * Joystick physics calculations for ArcWayfarer Dynamic Mode (v4 specification)
 */

export type CurveMode = 'power' | 'progressive'

export const DEFAULT_DEADZONE = 0.05
export const DEFAULT_EXPONENT = 2.0
export const KEYBOARD_FLOOR = 0.2
export const KEYBOARD_RAMP_TIME_MS = 600
export const KEYBOARD_P_KBD = 2.0

/**
 * Calculates dynamic intensity for analog/drag joystick input.
 *
 * @param rawDistance Current drag distance from center
 * @param maxDistance Maximum drag radius (boundary)
 * @param mode 'power' for exponential curve, 'progressive' for multi-tier speed zones
 * @param exponent Response curve exponent p (default 2.0)
 * @param deadzone Deadzone threshold ratio (default 0.05 = 5%)
 * @returns Mapped intensity [0.0, 1.0]
 */
export function calcDynamicIntensity(
  rawDistance: number,
  maxDistance: number,
  mode: CurveMode = 'power',
  exponent: number = DEFAULT_EXPONENT,
  deadzone: number = DEFAULT_DEADZONE
): number {
  if (maxDistance <= 0) return 0.0

  const r = Math.min(1.0, Math.max(0.0, rawDistance / maxDistance))
  if (r <= deadzone) return 0.0

  // Re-normalize effective ratio across [0, 1]
  const rEff = (r - deadzone) / (1.0 - deadzone)

  if (mode === 'progressive') {
    // Multi-tier speed zones:
    // 0.0 ~ 0.3 -> 0.0 ~ 0.2 (Walk)
    // 0.3 ~ 0.7 -> 0.2 ~ 0.6 (Jog)
    // 0.7 ~ 1.0 -> 0.6 ~ 1.0 (Sprint)
    if (rEff <= 0.3) {
      return (rEff / 0.3) * 0.2
    } else if (rEff <= 0.7) {
      return 0.2 + ((rEff - 0.3) / 0.4) * 0.4
    } else {
      return 0.6 + ((rEff - 0.7) / 0.3) * 0.4
    }
  }

  // Default: Power curve (Intensity = rEff^p)
  const p = Math.max(1.0, exponent)
  const intensity = Math.pow(rEff, p)
  return Math.min(1.0, Math.max(0.0, intensity))
}

/**
 * Calculates keyboard ramp-up intensity (v4 specification).
 * Uses independent p_kbd = 2.0, starting floor = 0.2, and clamp min(ceiling, base).
 *
 * @param elapsedMs Continuous time held down in ms
 * @param isShiftPressed Whether Shift key is currently held
 * @param rampTimeMs Acceleration duration to reach max (default 600ms)
 * @param floor Initial starting thrust floor (default 0.2 = 20%)
 * @param pKbd Fixed keyboard power exponent (default 2.0)
 * @returns Final clamped intensity [0.0, 1.0]
 */
export function calcKeyboardIntensity(
  elapsedMs: number,
  isShiftPressed: boolean = false,
  rampTimeMs: number = KEYBOARD_RAMP_TIME_MS,
  floor: number = KEYBOARD_FLOOR,
  pKbd: number = KEYBOARD_P_KBD
): number {
  if (elapsedMs < 0) return 0.0

  const u = Math.min(1.0, Math.max(0.0, elapsedMs / Math.max(1, rampTimeMs)))
  const baseIntensity = floor + (1.0 - floor) * Math.pow(u, pKbd)
  const ceiling = isShiftPressed ? 1.0 : 0.5

  return Math.min(ceiling, baseIntensity)
}
