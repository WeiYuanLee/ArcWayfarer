import { useState } from 'react'
import { addFavorite } from '../../services/api'
import { useT } from '../../i18n'
import type { LatLng } from './types'

type Props = {
  point: LatLng | null
}

export function FavoriteButton({ point }: Props) {
  const t = useT()
  const [added, setAdded] = useState(false)

  async function handleAdd() {
    if (!point) return
    try {
      await addFavorite({ name: `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`, lat: point.lat, lng: point.lng })
      setAdded(true)
      setTimeout(() => setAdded(false), 1500)
    } catch {
      // ignore, non-critical
    }
  }

  return (
    <button
      type="button"
      className="favorite-add-button"
      disabled={!point}
      onClick={handleAdd}
      title={t('favorites.add')}
    >
      {added ? '★' : '☆'}
    </button>
  )
}
