import React, { useState, useEffect, useRef } from 'react'
import type { PlaceSearchResult } from '../../services/geocoding'
import { useT } from '../../i18n'
import { useClickOutside } from '../../hooks/useClickOutside'
import { usePlaceSearch } from '../../hooks/usePlaceSearch'

interface Props {
  onSelectPlace: (lat: number, lng: number, placeName: string) => void
}

export const PlaceSearchBar: React.FC<Props> = ({ onSelectPlace }) => {
  const t = useT()
  const [keyword, setKeyword] = useState('')
  const { results, loading, errorMsg, clearResults } = usePlaceSearch(keyword)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)

  const containerRef = useRef<HTMLDivElement>(null)

  useClickOutside([containerRef], () => setIsOpen(false), isOpen)

  useEffect(() => {
    if (results.length > 0 || errorMsg) {
      setIsOpen(true)
      setSelectedIndex(-1)
    } else if (!keyword.trim()) {
      setIsOpen(false)
    }
  }, [results, errorMsg, keyword])

  const handleSelect = (item: PlaceSearchResult) => {
    onSelectPlace(item.lat, item.lng, item.name)
    setKeyword(item.name)
    setIsOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    if (!isOpen || results.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const targetIndex = selectedIndex >= 0 ? selectedIndex : 0
      if (targetIndex < results.length) {
        handleSelect(results[targetIndex])
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
              clearResults()
              setIsOpen(false)
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
              onMouseEnter={() => setSelectedIndex(index)}
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
