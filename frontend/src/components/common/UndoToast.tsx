import { useEffect, useRef } from 'react'
import { useT } from '../../i18n'
import type { Favorite } from '../../services/api'
import { notify } from './Toast'

type Props = {
  pendingDeletes: Map<string, { favorite: Favorite }>
  onUndo: (id: string) => void
}

export function UndoToast({ pendingDeletes, onUndo }: Props) {
  const t = useT()
  const shownIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const nextIds = new Set(pendingDeletes.keys())
    for (const id of shownIdsRef.current) {
      if (!nextIds.has(id)) notify.hide(`favorite-delete:${id}`)
    }
    for (const [id, { favorite }] of pendingDeletes) {
      if (shownIdsRef.current.has(id)) continue
      notify.action({
        id: `favorite-delete:${id}`,
        message: `${t('favorites.undo_delete')}: ${favorite.name}`,
        actionLabel: t('favorites.undo'),
        onAction: () => onUndo(id),
        tone: 'warning',
        autoClose: false,
      })
    }
    shownIdsRef.current = nextIds
  }, [onUndo, pendingDeletes, t])

  useEffect(() => () => {
    for (const id of shownIdsRef.current) notify.hide(`favorite-delete:${id}`)
  }, [])

  return null
}
