import { useEffect, useRef } from 'react'
import { calcKeyboardIntensity } from '../utils/joystickPhysics'

type Direction = 'up' | 'down' | 'left' | 'right'

const KEY_MAP: Record<string, Direction> = {
  w: 'up',
  arrowup: 'up',
  s: 'down',
  arrowdown: 'down',
  a: 'left',
  arrowleft: 'left',
  d: 'right',
  arrowright: 'right',
}

function isTypingTarget(target: EventTarget | null): boolean {
  const tag = (target as HTMLElement | null)?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA'
}

export function useJoystickKeyboard(
  onMove: (direction: number, intensity: number) => void,
  enabled: boolean,
  dynamic: boolean = false
) {
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove

  const dynamicRef = useRef(dynamic)
  dynamicRef.current = dynamic

  useEffect(() => {
    if (!enabled) return

    const pressed: Record<Direction, boolean> = { up: false, down: false, left: false, right: false }
    let startTimeRef: number | null = null
    let rafId: number | null = null

    function getActiveCount(): number {
      return (pressed.up ? 1 : 0) + (pressed.down ? 1 : 0) + (pressed.left ? 1 : 0) + (pressed.right ? 1 : 0)
    }

    function tick() {
      const activeCount = getActiveCount()
      if (activeCount === 0) {
        startTimeRef = null
        onMoveRef.current(0, 0)
        if (rafId !== null) {
          cancelAnimationFrame(rafId)
          rafId = null
        }
        return
      }

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      if (startTimeRef === null) {
        startTimeRef = now
      }

      const elapsedMs = Math.max(0, now - startTimeRef)
      const dx = (pressed.right ? 1 : 0) - (pressed.left ? 1 : 0)
      const dy = (pressed.up ? 1 : 0) - (pressed.down ? 1 : 0)
      const deg = Math.round((((Math.atan2(dx, dy) * 180) / Math.PI % 360) + 360) % 360)

      const intensity = dynamicRef.current
        ? calcKeyboardIntensity(elapsedMs, true)
        : 1.0

      onMoveRef.current(deg, intensity)
      rafId = requestAnimationFrame(tick)
    }

    function startLoopIfNeeded() {
      if (rafId === null) {
        rafId = requestAnimationFrame(tick)
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return

      const dir = KEY_MAP[e.key.toLowerCase()]
      if (!dir) return

      const wasActive = getActiveCount() > 0
      pressed[dir] = true

      if (!wasActive) {
        startTimeRef = typeof performance !== 'undefined' ? performance.now() : Date.now()
      }

      startLoopIfNeeded()
    }

    function onKeyUp(e: KeyboardEvent) {
      const dir = KEY_MAP[e.key.toLowerCase()]
      if (!dir) return

      pressed[dir] = false

      if (getActiveCount() === 0) {
        startTimeRef = null
        if (rafId !== null) {
          cancelAnimationFrame(rafId)
          rafId = null
        }
        onMoveRef.current(0, 0)
      }
    }

    function onBlur() {
      pressed.up = pressed.down = pressed.left = pressed.right = false
      startTimeRef = null
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      onMoveRef.current(0, 0)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
      onMoveRef.current(0, 0)
    }
  }, [enabled])
}
