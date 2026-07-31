import { useEffect } from 'react'

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

export function useJoystickKeyboard(onMove: (direction: number, intensity: number) => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    const pressed: Record<Direction, boolean> = { up: false, down: false, left: false, right: false }

    function emit() {
      const dx = (pressed.right ? 1 : 0) - (pressed.left ? 1 : 0)
      const dy = (pressed.up ? 1 : 0) - (pressed.down ? 1 : 0)
      if (dx === 0 && dy === 0) {
        onMove(0, 0)
        return
      }
      const deg = (Math.atan2(dx, dy) * 180) / Math.PI
      onMove(((deg % 360) + 360) % 360, 1)
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return
      const dir = KEY_MAP[e.key.toLowerCase()]
      if (!dir || pressed[dir]) return
      pressed[dir] = true
      emit()
    }

    function onKeyUp(e: KeyboardEvent) {
      const dir = KEY_MAP[e.key.toLowerCase()]
      if (!dir) return
      pressed[dir] = false
      emit()
    }

    function onBlur() {
      pressed.up = pressed.down = pressed.left = pressed.right = false
      emit()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [onMove, enabled])
}
