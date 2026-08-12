// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_JOYSTICK_CONFIG, JOYSTICK_STORAGE_KEY, useJoystickConfig } from './useJoystickConfig'

describe('useJoystickConfig', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('loads default config when nothing stored', () => {
    const { result } = renderHook(() => useJoystickConfig())
    expect(result.current.config).toEqual(DEFAULT_JOYSTICK_CONFIG)
  })

  it('loads saved config from localStorage', () => {
    const saved = {
      isDynamic: false,
      curveMode: 'progressive',
      curveExponent: 2.5,
      enableKeyboardRamp: false,
    }
    localStorage.setItem(JOYSTICK_STORAGE_KEY, JSON.stringify(saved))

    const { result } = renderHook(() => useJoystickConfig())
    expect(result.current.config).toEqual(saved)
  })

  it('updates config and persists to localStorage', () => {
    const { result } = renderHook(() => useJoystickConfig())

    act(() => {
      result.current.updateConfig({ curveExponent: 2.8, curveMode: 'progressive' })
    })

    expect(result.current.config.curveExponent).toBe(2.8)
    expect(result.current.config.curveMode).toBe('progressive')

    const stored = JSON.parse(localStorage.getItem(JOYSTICK_STORAGE_KEY) || '{}')
    expect(stored.curveExponent).toBe(2.8)
    expect(stored.curveMode).toBe('progressive')
  })
})
