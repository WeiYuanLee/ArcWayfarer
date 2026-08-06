import { useCallback, useEffect, useRef, useState } from 'react'
import { WS_URL } from '../services/api'

export type LivePosition = { lat: number; lng: number; speedMps: number; etaSeconds: number; stopIndex: number | null }
type DeviceState = 'idle' | 'teleporting' | 'navigating' | 'looping' | 'random_walk' | 'joystick' | 'paused'
type PositionMessage = {
  type: 'position'
  udid: string
  lat: number | null
  lng: number | null
  speed_mps: number
  eta_seconds: number
  stop_index: number | null
}
type StateMessage = { type: 'state'; udid: string; state: DeviceState }
type Message = PositionMessage | StateMessage

export function useWebSocket() {
  const [connected, setConnected] = useState(false)
  const [positions, setPositions] = useState<Record<string, LivePosition>>({})
  const [states, setStates] = useState<Record<string, DeviceState>>({})
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectAttemptRef = useRef(0)

  useEffect(() => {
    let timer: NodeJS.Timeout
    let isUnmounted = false

    const connect = () => {
      if (isUnmounted) return
      const socket = new WebSocket(WS_URL)
      socketRef.current = socket

      socket.onopen = () => {
        setConnected(true)
        reconnectAttemptRef.current = 0
      }

      socket.onclose = () => {
        setConnected(false)
        if (isUnmounted) return
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000)
        reconnectAttemptRef.current += 1
        timer = setTimeout(connect, delay)
      }

      socket.onerror = () => {
        socket.close()
      }

      socket.onmessage = (event) => {
        try {
          const message: Message = JSON.parse(event.data)
          if (message.type === 'position') {
            if (message.lat === null || message.lng === null) {
              setPositions((prev) => {
                if (!(message.udid in prev)) return prev
                const next = { ...prev }
                delete next[message.udid]
                return next
              })
            } else {
              setPositions((prev) => ({
                ...prev,
                [message.udid]: {
                  lat: message.lat!,
                  lng: message.lng!,
                  speedMps: message.speed_mps,
                  etaSeconds: message.eta_seconds,
                  stopIndex: message.stop_index,
                },
              }))
            }
          } else if (message.type === 'state') {
            setStates((prev) => ({ ...prev, [message.udid]: message.state }))
          }
        } catch {
          // ignore malformed messages
        }
      }
    }

    connect()

    return () => {
      isUnmounted = true
      clearTimeout(timer)
      socketRef.current?.close()
    }
  }, [])

  const send = useCallback((type: string, data: unknown, udid?: string) => {
    socketRef.current?.send(JSON.stringify({ type, data, udid }))
  }, [])

  return { connected, positions, states, send }
}
