import React, { useState, useEffect, useRef } from 'react'
import { searchPlaceByKeyword, type PlaceSearchResult } from '../../services/geocoding'
import { useT } from '../../i18n'
import { useClickOutside } from '../../hooks/useClickOutside'

interface Props {
  onSelectPlace: (lat: number, lng: number, placeName: string) => void
}

export const PlaceSearchBar: React.FC<Props> = ({ onSelectPlace }) => {
  const t = useT()
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<PlaceSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)

  useClickOutside([containerRef], () => setIsOpen(false), isOpen)

  useEffect(() => {
    const trimmed = keyword.trim()
    if (!trimmed) {
      setResults([])
      setIsOpen(false)
      setErrorMsg(null)
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      setErrorMsg(null)
      try {
        const items = await searchPlaceByKeyword(trimmed, controller.signal)
        setResults(items)
        setIsOpen(true)
        setSelectedIndex(-1)
        if (items.length === 0) {
          setErrorMsg(t('search.no_results'))
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Keyword search failed:', err)
          setErrorMsg(t('search.no_results'))
        }
      } finally {
        setLoading(false)
      }
    }, 350)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [keyword, t])

  const handleSelect = (item: PlaceSearchResult) => {
    onSelectPlace(item.lat, item.lng, item.name)
    setKeyword(item.name)
    setIsOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        handleSelect(results[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div className="place-search-container" ref={containerRef}>
      <div className="place-search-input-box">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onFocus={() => (results.length > 0 || errorMsg) && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={t('search.placeholder')}
          className="place-search-input"
        />
        {loading && <div className="place-search-spinner" />}
        {keyword && !loading && (
          <button
            className="place-search-clear"
            onClick={() => {
              setKeyword('')
              setResults([])
              setIsOpen(false)
              setErrorMsg(null)
            }}
            title="Clear"
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && (
        <ul className="place-search-dropdown">
          {errorMsg && results.length === 0 && (
            <li className="dropdown-empty">{errorMsg}</li>
          )}
          {results.map((item, index) => (
            <li
              key={item.id}
              className={`dropdown-row ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => handleSelect(item)}
            >
              <span className="row-icon">📍</span>
              <div className="row-text">
                <div className="place-title">{item.name}</div>
                <div className="place-address" title={item.address}>
                  {item.address}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
