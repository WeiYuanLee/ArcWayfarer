import { useEffect } from 'react'
import type { RefObject } from 'react'

export function useClickOutside(refs: RefObject<HTMLElement>[], onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return

    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (refs.some((ref) => ref.current?.contains(target))) return
      onOutside()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [refs, onOutside, active])
}
