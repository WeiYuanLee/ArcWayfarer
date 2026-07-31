import { useEffect, useState } from 'react'
import { listHistory, type HistoryEntry } from '../../services/api'
import { useI18n } from '../../i18n'
import { formatRelativeTime } from './relativeTime'

type Props = {
  onFlyTo: (lat: number, lng: number) => void
}

export function HistoryPanel({ onFlyTo }: Props) {
  const { t, lang } = useI18n()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listHistory()
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flyout-content">
      <h2>{t('history.title')}</h2>
      {loading && <p className="panel-hint">{t('generic.working')}</p>}
      {!loading && entries.length === 0 && <p className="panel-hint">{t('history.empty')}</p>}
      <ul className="flyout-list">
        {entries.map((entry, i) => (
          <li key={i}>
            <button className="flyout-item" onClick={() => onFlyTo(entry.lat, entry.lng)}>
              <span className="flyout-item-name">
                {entry.name || `${entry.lat.toFixed(4)}, ${entry.lng.toFixed(4)}`}
              </span>
              <span className="flyout-item-time">{formatRelativeTime(entry.ts, lang)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
