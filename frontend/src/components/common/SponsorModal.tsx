import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../../i18n'

const SPONSOR_PAYPAL_LINK = 'https://paypal.me/REPLACE_ME'

type Props = {
  isOpen: boolean
  onClose: () => void
}

export function SponsorModal({ isOpen, onClose }: Props) {
  const t = useT()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return createPortal(
    <div className="modal-backdrop" onClick={onClose} style={backdropStyle}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sponsor-modal-title"
        aria-describedby="sponsor-modal-desc"
        className="modal-card"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="sponsor-modal-title" style={{ margin: '0 0 8px 0', fontSize: '16px' }}>
          {t('sponsor.title')}
        </h3>
        <p id="sponsor-modal-desc" style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#a0a0a0', lineHeight: 1.4 }}>
          {t('sponsor.description')}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button className="swap-button" onClick={onClose}>
            {t('sponsor.close')}
          </button>
          <a
            className="swap-button"
            href={SPONSOR_PAYPAL_LINK}
            target="_blank"
            rel="noopener noreferrer"
            style={{ backgroundColor: '#0070ba', color: '#fff', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            {t('sponsor.cta')}
          </a>
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
