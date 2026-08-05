import { useState, useEffect } from 'react'
import { searchPlaceByKeyword, type PlaceSearchResult } from '../services/geocoding'
import { useT } from '../i18n'

export interface UsePlaceSearchResult {
  results: PlaceSearchResult[]
  loading: boolean
  errorMsg: string | null
  clearResults: () => void
}

export function usePlaceSearch(query: string): UsePlaceSearchResult {
  const t = useT()
  const [results, setResults] = useState<PlaceSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const clearResults = () => {
    setResults([])
    setErrorMsg(null)
    setLoading(false)
  }

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setLoading(false)
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
  }, [query, t])

  return { results, loading, errorMsg, clearResults }
}
