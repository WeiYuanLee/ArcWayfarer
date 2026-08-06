import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../../i18n'

type Props = {
  isOpen: boolean
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  isOpen,
  title,
  description,
  confirmText,
  cancelText,
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  const t = useT()
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      confirmBtnRef.current?.focus()
    }
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return createPortal(
    <div className="modal-backdrop" onClick={onCancel} style={backdropStyle}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-desc"
        className="modal-card"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-modal-title" style={{ margin: '0 0 8px 0', fontSize: '16px' }}>{title}</h3>
        <p id="confirm-modal-desc" style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#a0a0a0', lineHeight: 1.4 }}>
          {description}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button className="swap-button" onClick={onCancel}>
            {cancelText || t('confirm.cancel')}
          </button>
          <button
            ref={confirmBtnRef}
            className="swap-button"
            style={danger ? { backgroundColor: '#e74c3c', color: '#fff', border: 'none' } : undefined}
            onClick={() => {
              onConfirm()
              onCancel()
            }}
          >
            {confirmText || t('confirm.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  backdropFilter: 'blur(3px)',
}

const cardStyle: React.CSSProperties = {
  backgroundColor: '#1e1e24',
  border: '1px solid #333',
  borderRadius: '8px',
  padding: '18px 20px',
  maxWidth: '380px',
  width: '90%',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  color: '#f0f0f0',
}
