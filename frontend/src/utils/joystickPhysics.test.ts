import { describe, expect, it } from 'vitest'
import { calcDynamicIntensity, calcKeyboardIntensity } from './joystickPhysics'

describe('calcDynamicIntensity (Analog Drag)', () => {
  it('returns 0 when distance is within deadzone', () => {
    // Deadzone is 5% (0.05 * 100 = 5)
    expect(calcDynamicIntensity(0, 100)).toBe(0)
    expect(calcDynamicIntensity(3, 100)).toBe(0)
    expect(calcDynamicIntensity(5, 100)).toBe(0)
  })

  it('re-normalizes properly after deadzone', () => {
    // rawDistance = 52.5, maxDistance = 100 -> r = 0.525
    // deadzone = 0.05 -> rEff = (0.525 - 0.05) / 0.95 = 0.5
    // With p = 2.0, intensity = 0.5^2 = 0.25
    const intensity = calcDynamicIntensity(52.5, 100, 'power', 2.0, 0.05)
    expect(intensity).toBeCloseTo(0.25, 4)
  })

  it('returns 1.0 when rawDistance equals maxDistance', () => {
    expect(calcDynamicIntensity(100, 100, 'power', 2.0)).toBe(1.0)
    expect(calcDynamicIntensity(100, 100, 'power', 3.0)).toBe(1.0)
    expect(calcDynamicIntensity(100, 100, 'progressive')).toBe(1.0)
  })

  it('handles linear curve (p = 1.0)', () => {
    // r = 0.525, deadzone = 0.05 -> rEff = 0.5
    // With p = 1.0, intensity = 0.5
    expect(calcDynamicIntensity(52.5, 100, 'power', 1.0)).toBeCloseTo(0.5, 4)
  })

  it('calculates progressive multi-tier zones correctly', () => {
    // Zone 1: rEff = 0.3 -> intensity = 0.2
    // rawDistance for rEff = 0.3: 0.05 + 0.3 * 0.95 = 0.335 * 100 = 33.5
    expect(calcDynamicIntensity(33.5, 100, 'progressive')).toBeCloseTo(0.2, 4)

    // Zone 2: rEff = 0.7 -> intensity = 0.6
    // rawDistance for rEff = 0.7: 0.05 + 0.7 * 0.95 = 0.715 * 100 = 71.5
    expect(calcDynamicIntensity(71.5, 100, 'progressive')).toBeCloseTo(0.6, 4)
  })
})

describe('calcKeyboardIntensity (WASD Acceleration)', () => {
  it('returns initial floor (0.2) at elapsedMs = 0ms without Shift', () => {
    const intensity = calcKeyboardIntensity(0, false)
    expect(intensity).toBeCloseTo(0.2, 4)
  })

  it('clamps to ceiling 0.5 at elapsedMs = 600ms when Shift is false', () => {
    // base = 0.2 + 0.8 * 1.0^2 = 1.0, clamped by min(0.5, 1.0) = 0.5
    const intensity = calcKeyboardIntensity(600, false)
    expect(intensity).toBeCloseTo(0.5, 4)
  })

  it('unlocks 1.0 full speed at elapsedMs = 600ms when Shift is true', () => {
    // base = 1.0, clamped by min(1.0, 1.0) = 1.0
    const intensity = calcKeyboardIntensity(600, true)
    expect(intensity).toBeCloseTo(1.0, 4)
  })

  it('calculates correct mid-ramp intensity at elapsedMs = 300ms', () => {
    // u = 300 / 600 = 0.5
    // base = 0.2 + 0.8 * (0.5^2) = 0.2 + 0.8 * 0.25 = 0.4
    // Without Shift: ceiling = 0.5 -> min(0.5, 0.4) = 0.4
    const intensity = calcKeyboardIntensity(300, false)
    expect(intensity).toBeCloseTo(0.4, 4)
  })

  it('instant response to Shift press during ramp', () => {
    // At t = 450ms, u = 0.75
    // base = 0.2 + 0.8 * (0.75^2) = 0.2 + 0.8 * 0.5625 = 0.65
    // Without Shift: min(0.5, 0.65) = 0.5
    // With Shift: min(1.0, 0.65) = 0.65
    expect(calcKeyboardIntensity(450, false)).toBeCloseTo(0.5, 4)
    expect(calcKeyboardIntensity(450, true)).toBeCloseTo(0.65, 4)
  })
})
