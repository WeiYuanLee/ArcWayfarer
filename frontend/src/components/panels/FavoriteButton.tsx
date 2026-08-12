import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { addFavorite } from '../../services/api'
import { useT } from '../../i18n'
import type { LatLng } from './types'

type Props = {
  point: LatLng | null
}

export function FavoriteButton({ point }: Props) {
  const t = useT()
  const [added, setAdded] = useState(false)
  const [isNaming, setIsNaming] = useState(false)
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isNaming) inputRef.current?.focus()
  }, [isNaming])

  function handleOpenNaming() {
    if (!point) return
    setName('')
    setIsNaming(true)
  }

  async function handleAdd() {
    if (!point || !name.trim()) return
    try {
      await addFavorite({ name: name.trim(), lat: point.lat, lng: point.lng })
      setAdded(true)
      setIsNaming(false)
      setTimeout(() => setAdded(false), 1500)
    } catch {
      // ignore, non-critical
    }
  }

  return (
    <>
      <button
        type="button"
        className="favorite-add-button"
        disabled={!point}
        onClick={handleOpenNaming}
        title={t('favorites.add')}
      >
        {added ? '★' : '☆'}
      </button>
      {isNaming && point && createPortal(
      <div className="modal-backdrop" onMouseDown={() => setIsNaming(false)}>
        <form
          className="favorite-name-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="favorite-name-title"
          onMouseDown={(event) => event.stopPropagation()}
          onSubmit={(event) => {
            event.preventDefault()
            void handleAdd()
          }}
        >
          <h3 id="favorite-name-title">{t('favorites.name_title')}</h3>
          <p>{point.lat.toFixed(6)}, {point.lng.toFixed(6)}</p>
          <input
            ref={inputRef}
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('favorites.name_placeholder')}
          />
          <div className="favorite-name-actions">
            <button type="button" className="swap-button" onClick={() => setIsNaming(false)}>{t('favorites.cancel')}</button>
            <button type="submit" className="swap-button" disabled={!name.trim()}>{t('favorites.save')}</button>
          </div>
        </form>
      </div>,
      document.body
      )}
    </>
  )
}
