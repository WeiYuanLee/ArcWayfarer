import { useEffect, useState } from 'react'
import { listHistory, type HistoryEntry } from '../../services/api'
import { useI18n } from '../../i18n'
import { formatRelativeTime } from './relativeTime'
import { Drawer } from '@mantine/core'

type Props = {
  isOpen: boolean
  onClose: () => void
  onFlyTo: (lat: number, lng: number) => void
}

const KIND_KEY: Record<string, string> = {
  teleport: 'mode.teleport',
  navigate: 'mode.navigate',
  route_loop: 'mode.route_loop',
  multi_stop: 'mode.multi_stop',
  random_walk: 'mode.random_walk',
  joystick: 'mode.joystick',
}

export function HistoryDrawer({ isOpen, onClose, onFlyTo }: Props) {
  const { t, lang } = useI18n()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    listHistory()
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isOpen])

  function handleSelect(lat: number, lng: number) {
    onFlyTo(lat, lng)
    onClose()
  }

  return (
    <Drawer opened={isOpen} onClose={onClose} position="right" size={400} padding={0} withCloseButton={false} aria-label={t('history.title')}>
        <div className="fav-drawer-header">
          <div className="fav-drawer-title-row">
            <h2 className="fav-drawer-title">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="fav-drawer-title-icon" style={{ color: '#7eb8d4' }}>
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              {t('history.title')}
            </h2>
            <span className="fav-drawer-count">{entries.length} {t('history.count')}</span>
            <button className="fav-drawer-close" onClick={onClose} aria-label={t('favorites.cancel')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="fav-drawer-body">
          {loading && <p className="fav-hint">{t('generic.working')}</p>}
          {!loading && entries.length === 0 && <p className="fav-hint">{t('history.empty')}</p>}
          {!loading && entries.length > 0 && (
            <ul className="fav-list">
              {entries.map((entry, i) => (
                <li key={i} className="fav-item">
                  <button className="hist-item-btn" onClick={() => handleSelect(entry.lat, entry.lng)}>
                    <span className="hist-kind-badge">{t(KIND_KEY[entry.kind] as Parameters<typeof t>[0] ?? 'mode.teleport')}</span>
                    <span className="hist-coords">{entry.lat.toFixed(5)}, {entry.lng.toFixed(5)}</span>
                    <span className="hist-time">{formatRelativeTime(entry.ts, lang)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
    </Drawer>
  )
}
