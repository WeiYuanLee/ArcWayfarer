import { createPortal } from 'react-dom'
import { useT } from '../../i18n'
import type { Favorite } from '../../services/api'

type Props = {
  pendingDeletes: Map<string, { favorite: Favorite }>
  onUndo: (id: string) => void
}

export function UndoToast({ pendingDeletes, onUndo }: Props) {
  const t = useT()
  const items = Array.from(pendingDeletes.entries())
  if (items.length === 0) return null

  return createPortal(
    <div className="undo-toast-stack">
      {items.map(([id, { favorite }]) => (
        <div key={id} className="undo-toast">
          <span className="undo-toast-label">
            {t('favorites.undo_delete')}: <strong>{favorite.name}</strong>
          </span>
          <button className="undo-toast-btn" onClick={() => onUndo(id)}>
            {t('favorites.undo')}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}
