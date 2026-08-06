import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export type ContextMenuItem = {
  id: string
  label: string
  icon?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

type Props = {
  x: number
  y: number
  title?: string
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, title, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const buttons = menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
        if (!buttons || buttons.length === 0) return
        const activeIndex = Array.from(buttons).indexOf(document.activeElement as HTMLButtonElement)
        let nextIndex = 0
        if (e.key === 'ArrowDown') {
          nextIndex = activeIndex < buttons.length - 1 ? activeIndex + 1 : 0
        } else {
          nextIndex = activeIndex > 0 ? activeIndex - 1 : buttons.length - 1
        }
        buttons[nextIndex]?.focus()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    const timer = setTimeout(() => {
      const firstButton = menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')
      firstButton?.focus()
    }, 30)
    return () => clearTimeout(timer)
  }, [])

  // Prevent menu from clipping outside viewport
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const posX = Math.min(x, viewportWidth - 220)
  const posY = Math.min(y, viewportHeight - 260)

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={title || 'Context Menu'}
      className="custom-context-menu"
      style={{ left: `${posX}px`, top: `${posY}px` }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {title && <div className="context-menu-header">{title}</div>}
      <div className="context-menu-body" role="none">
        {items.map((item) => (
          <button
            key={item.id}
            role="menuitem"
            className={`context-menu-item ${item.danger ? 'danger' : ''}`}
            disabled={item.disabled}
            aria-disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return
              item.onClick()
              onClose()
            }}
          >
            {item.icon && <span className="item-icon">{item.icon}</span>}
            <span className="item-label">{item.label}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body
  )
}
