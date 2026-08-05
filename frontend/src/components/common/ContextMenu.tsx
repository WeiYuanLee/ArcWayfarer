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
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // Prevent menu from clipping outside viewport
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const posX = Math.min(x, viewportWidth - 220)
  const posY = Math.min(y, viewportHeight - 260)

  return createPortal(
    <div
      ref={menuRef}
      className="custom-context-menu"
      style={{ left: `${posX}px`, top: `${posY}px` }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {title && <div className="context-menu-header">{title}</div>}
      <div className="context-menu-body">
        {items.map((item) => (
          <button
            key={item.id}
            className={`context-menu-item ${item.danger ? 'danger' : ''}`}
            disabled={item.disabled}
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
