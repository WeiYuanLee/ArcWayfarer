import { useCallback, useEffect, useRef, useState } from 'react'
import { WS_URL } from '../services/api'

export type LivePosition = { lat: number; lng: number; speedMps: number; etaSeconds: number; stopIndex: number | null }
export type FlowerProgress = {
  flowerIndex: number
  totalFlowers: number
  circle: number
  totalCircles: number
  phase: string
  etaSeconds: number
  etaScope: 'total' | 'round'
  receivedAt: number
}
export type ActiveTask = { kind: string; path: { lat: number; lng: number }[] }
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
type StateMessage = { type: 'state'; udid: string; state: DeviceState; task?: { kind: string; path: { lat: number; lng: number }[] } | null }
type TaskSnapshotMessage = { type: 'task_snapshot'; tasks: { udid: string; state: DeviceState; kind: string; path: { lat: number; lng: number }[] }[] }
type RestoredMessage = { type: 'restored'; udid: string }
type FlowerProgressMessage = { type: 'flower_progress'; udid: string; flower_index?: number; flower_total?: number; total_flowers?: number; circle?: number; round?: number; total_circles?: number; phase?: string; eta_seconds?: number; eta_scope?: 'total' | 'round'; lat?: number; lng?: number }
type Message = PositionMessage | StateMessage | RestoredMessage | FlowerProgressMessage | TaskSnapshotMessage

export function useWebSocket() {
  const [connected, setConnected] = useState(false)
  const [positions, setPositions] = useState<Record<string, LivePosition>>({})
  const [states, setStates] = useState<Record<string, DeviceState>>({})
  const [restoredAt, setRestoredAt] = useState<Record<string, number>>({})
  const [flowerProgress, setFlowerProgress] = useState<Record<string, FlowerProgress>>({})
  const [activeTasks, setActiveTasks] = useState<Record<string, ActiveTask>>({})
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
        if (window.location.pathname.startsWith('/mobile')) {
          socket.send(JSON.stringify({
            type: 'auth',
            data: { session: sessionStorage.getItem('arcwayfarer.mobile.session') },
          }))
        }
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
            if (message.task) {
              setActiveTasks((prev) => ({ ...prev, [message.udid]: message.task! }))
            } else if (message.state === 'idle') setActiveTasks((prev) => {
              if (!(message.udid in prev)) return prev
              const next = { ...prev }; delete next[message.udid]; return next
            })
          } else if (message.type === 'task_snapshot') {
            setStates((prev) => ({ ...prev, ...Object.fromEntries(message.tasks.map((task) => [task.udid, task.state])) }))
            setActiveTasks(Object.fromEntries(message.tasks.map((task) => [task.udid, { kind: task.kind, path: task.path }])))
          } else if (message.type === 'restored') {
            setRestoredAt((prev) => ({ ...prev, [message.udid]: Date.now() }))
          } else if (message.type === 'flower_progress') {
            if (typeof message.lat === 'number' && typeof message.lng === 'number') {
              setPositions((prev) => ({
                ...prev,
                [message.udid]: {
                  // Flower progress follows the regular position event.  It may
                  // refine the coordinate, but must not erase its live speed.
                  lat: message.lat!, lng: message.lng!,
                  speedMps: prev[message.udid]?.speedMps ?? 0,
                  etaSeconds: prev[message.udid]?.etaSeconds ?? 0,
                  stopIndex: message.flower_index ?? null,
                },
              }))
            }
            setFlowerProgress((prev) => ({
              ...prev,
              [message.udid]: {
                flowerIndex: message.flower_index ?? 1,
                totalFlowers: message.flower_total ?? message.total_flowers ?? 1,
                circle: message.circle ?? message.round ?? 1,
                totalCircles: message.total_circles ?? 1,
                phase: message.phase ?? 'traveling',
                etaSeconds: message.eta_seconds ?? 0,
                etaScope: message.eta_scope ?? 'total',
                receivedAt: Date.now(),
              },
            }))
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

  return { connected, positions, states, restoredAt, flowerProgress, activeTasks, send }
}
