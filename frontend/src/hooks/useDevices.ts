import { useCallback, useEffect, useRef, useState } from 'react'
import { listDevices, type Device } from '../services/api'

export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const cancelledRef = useRef(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listDevices()
      if (!cancelledRef.current) setDevices(result)
    } catch {
      if (!cancelledRef.current) setDevices([])
    } finally {
      if (!cancelledRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    cancelledRef.current = false
    refresh()
    return () => {
      cancelledRef.current = true
    }
  }, [refresh])

  return { devices, loading, refresh }
}
