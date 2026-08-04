import { useEffect, useRef, useState } from 'react'
import { listFavorites, listHistory, type Favorite, type HistoryEntry } from '../../services/api'
import { useT } from '../../i18n'
import type { Mode } from '../ModeSelector'

type Props = {
  isOpen: boolean
  onClose: () => void
  onSelectMode: (mode: Mode) => void
  onFlyTo: (lat: number, lng: number) => void
  onRefreshDevices: () => void
}

type PaletteItem = {
  id: string
  section: 'modes' | 'actions' | 'favorites' | 'history'
  title: string
  subtitle?: string
  action: () => void
}

export function CommandPalette({ isOpen, onClose, onSelectMode, onFlyTo, onRefreshDevices }: Props) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setSelectedIndex(0)
    setTimeout(() => inputRef.current?.focus(), 50)

    listFavorites()
      .then(setFavorites)
      .catch(() => {})
    listHistory()
      .then((items: HistoryEntry[]) => setHistory(items.slice(0, 10)))
      .catch(() => {})
  }, [isOpen])

  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (isOpen) {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const modeItems: PaletteItem[] = [
    { id: 'mode-teleport', section: 'modes', title: t('mode.teleport'), subtitle: 'Mode', action: () => onSelectMode('teleport') },
    { id: 'mode-navigate', section: 'modes', title: t('mode.navigate'), subtitle: 'Mode', action: () => onSelectMode('navigate') },
    { id: 'mode-routeloop', section: 'modes', title: t('mode.route_loop'), subtitle: 'Mode', action: () => onSelectMode('route-loop') },
    { id: 'mode-multistop', section: 'modes', title: t('mode.multi_stop'), subtitle: 'Mode', action: () => onSelectMode('multi-stop') },
    { id: 'mode-randomwalk', section: 'modes', title: t('mode.random_walk'), subtitle: 'Mode', action: () => onSelectMode('random-walk') },
    { id: 'mode-joystick', section: 'modes', title: t('mode.joystick'), subtitle: 'Mode', action: () => onSelectMode('joystick') },
  ]

  const actionItems: PaletteItem[] = [
    { id: 'act-refresh', section: 'actions', title: t('device.rescan'), subtitle: 'Action', action: () => onRefreshDevices() },
  ]

  const favItems: PaletteItem[] = favorites.map((f) => ({
    id: `fav-${f.id}`,
    section: 'favorites',
    title: f.name,
    subtitle: `Favorite · ${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}`,
    action: () => onFlyTo(f.lat, f.lng),
  }))

  const histItems: PaletteItem[] = history.map((h, i) => ({
    id: `hist-${i}-${h.ts}`,
    section: 'history',
    title: h.name || `${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}`,
    subtitle: `History · ${h.kind}`,
    action: () => onFlyTo(h.lat, h.lng),
  }))

  const allItems = [...modeItems, ...actionItems, ...favItems, ...histItems]
  const q = query.trim().toLowerCase()
  const filtered = q
    ? allItems.filter((item) => item.title.toLowerCase().includes(q) || item.subtitle?.toLowerCase().includes(q))
    : allItems

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = filtered[selectedIndex]
      if (selected) {
        selected.action()
        onClose()
      }
    }
  }

  return (
    <div className="cmd-palette-backdrop" onClick={onClose}>
      <div className="cmd-palette-modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="cmd-palette-header">
          <input
            ref={inputRef}
            className="cmd-palette-input"
            placeholder={t('cmdpalette.placeholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
          />
          <kbd className="cmd-palette-kbd">ESC</kbd>
        </div>

        <div className="cmd-palette-body">
          {filtered.length === 0 ? (
            <div className="cmd-palette-empty">{t('cmdpalette.no_results')}</div>
          ) : (
            filtered.map((item, idx) => (
              <div
                key={item.id}
                className={`cmd-palette-item ${idx === selectedIndex ? 'selected' : ''}`}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => {
                  item.action()
                  onClose()
                }}
              >
                <div className="cmd-palette-item-text">
                  <span className="cmd-palette-item-title">{item.title}</span>
                  {item.subtitle && <span className="cmd-palette-item-sub">{item.subtitle}</span>}
                </div>
                {idx === selectedIndex && <span className="cmd-palette-enter-hint">↵</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
