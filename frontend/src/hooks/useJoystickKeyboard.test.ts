// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useJoystickKeyboard } from './useJoystickKeyboard'

describe('useJoystickKeyboard', () => {
  let onMoveMock: ReturnType<typeof vi.fn>
  let rafCallback: ((time: number) => void) | null = null
  let nowTime = 1000

  beforeEach(() => {
    onMoveMock = vi.fn()
    nowTime = 1000
    rafCallback = null
    vi.spyOn(performance, 'now').mockImplementation(() => nowTime)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallback = cb as (time: number) => void
      return 123
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      rafCallback = null
    })
  })

  afterEach(() => vi.restoreAllMocks())

  function stepFrame(timeAdvanceMs: number) {
    nowTime += timeAdvanceMs
    if (rafCallback) {
      const cb = rafCallback
      rafCallback = null
      cb(nowTime)
    }
  }

  it('uses full configured speed immediately in fixed-speed mode', () => {
    renderHook(() => useJoystickKeyboard(onMoveMock, true, false))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))
    stepFrame(0)
    expect(onMoveMock).toHaveBeenCalledWith(0, 1.0)
  })

  it('starts dynamic mode at 20 percent', () => {
    renderHook(() => useJoystickKeyboard(onMoveMock, true, true))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))
    stepFrame(0)
    expect(onMoveMock).toHaveBeenCalledWith(0, 0.2)
  })

  it('ramps dynamic mode to full speed at 600ms', () => {
    renderHook(() => useJoystickKeyboard(onMoveMock, true, true))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))
    stepFrame(600)
    expect(onMoveMock).toHaveBeenLastCalledWith(0, 1.0)
  })

  it('keeps acceleration progress while changing direction', () => {
    renderHook(() => useJoystickKeyboard(onMoveMock, true, true))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))
    stepFrame(300)
    expect(onMoveMock).toHaveBeenLastCalledWith(0, 0.4)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }))
    stepFrame(300)
    expect(onMoveMock).toHaveBeenLastCalledWith(45, 1.0)
  })

  it('stops immediately when all keys are released', () => {
    renderHook(() => useJoystickKeyboard(onMoveMock, true, true))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))
    stepFrame(300)
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }))
    expect(onMoveMock).toHaveBeenLastCalledWith(0, 0)
  })
})
