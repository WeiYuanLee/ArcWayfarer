import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PikminPureSpot } from '../../services/api'

export type PikminDrawerMode = 'favorites' | 'postcards' | 'purespots' | null
export type PikminMapBounds = {
  minLat: number
  minLng: number
  maxLat: number
  maxLng: number
  zoom: number
}

type PikminMapState = {
  mode: PikminDrawerMode
  setMode: (mode: PikminDrawerMode) => void
  bounds: PikminMapBounds | null
  setBounds: (bounds: PikminMapBounds) => void
  spots: PikminPureSpot[]
  setSpots: (spots: PikminPureSpot[]) => void
  selectedSpot: PikminPureSpot | null
  setSelectedSpot: (spot: PikminPureSpot | null) => void
}

const PikminMapContext = createContext<PikminMapState | null>(null)

export function PikminMapProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<PikminDrawerMode>(null)
  const [bounds, setBounds] = useState<PikminMapBounds | null>(null)
  const [spots, setSpots] = useState<PikminPureSpot[]>([])
  const [selectedSpot, setSelectedSpot] = useState<PikminPureSpot | null>(null)

  useEffect(() => {
    if (mode !== 'purespots') {
      setSpots([])
      setSelectedSpot(null)
    }
  }, [mode])

  const value = useMemo(() => ({
    mode,
    setMode,
    bounds,
    setBounds,
    spots,
    setSpots,
    selectedSpot,
    setSelectedSpot,
  }), [mode, bounds, spots, selectedSpot])

  return <PikminMapContext.Provider value={value}>{children}</PikminMapContext.Provider>
}

export function usePikminMap(): PikminMapState {
  const value = useContext(PikminMapContext)
  if (!value) throw new Error('usePikminMap must be used inside PikminMapProvider')
  return value
}
