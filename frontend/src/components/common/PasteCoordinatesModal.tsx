import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../../i18n'

type Props = {
  isOpen: boolean
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onClose: () => void
}

export function PasteCoordinatesModal({ isOpen, value, onChange, onSubmit, onClose }: Props) {
  const t = useT()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!isOpen) return
    textareaRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="paste-coordinates-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paste-coordinates-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <h3 id="paste-coordinates-title">{t('multistop.paste_coords')}</h3>
        <textarea
          ref={textareaRef}
          className="paste-textarea"
          placeholder={t('multistop.paste_placeholder')}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <div className="paste-coordinates-actions">
          <button type="button" className="swap-button" onClick={onClose}>
            {t('multistop.paste_cancel')}
          </button>
          <button type="submit" className="swap-button">
            {t('multistop.paste_submit')}
          </button>
        </div>
      </form>
    </div>,
    document.body
  )
}
