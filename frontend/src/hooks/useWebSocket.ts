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
export type ActiveTaskConfig = {
  waypoints?: { lat: number; lng: number }[]
  nav_mode?: 'walk' | 'bike' | 'drive'
  pause_enabled?: boolean
  pause_min?: number
  pause_max?: number
  straight_line?: boolean
  jump_mode?: boolean
  jump_pre_delay?: number
  jump_post_delay?: number
  custom_speed_kmh?: number | null
  flower?: {
    radius_m: number
    circles: number
    segments: number
    path_strategy: 'center_spiral' | 'perimeter'
    pre_wait_seconds: number
    post_wait_seconds: number
    route_type: 'stop_at_end' | 'return_to_start' | 'loop_forever'
    rounds: number | 'infinite'
  }
}
export type ActiveTask = {
  kind: string
  path: { lat: number; lng: number }[]
  taskId?: string
  revision?: number
  protocolVersion?: number
  config?: ActiveTaskConfig | null
}
type DeviceState =
  | 'idle'
  | 'teleporting'
  | 'navigating'
  | 'looping'
  | 'random_walk'
  | 'joystick'
  | 'paused'
  | 'paused:navigating'
  | 'paused:looping'
  | 'paused:random_walk'
  | 'paused:joystick'
type PositionMessage = {
  type: 'position'
  udid: string
  lat: number | null
  lng: number | null
  speed_mps: number
  eta_seconds: number
  stop_index: number | null
}
type WireTask = { udid: string; state: DeviceState; kind: string; path: { lat: number; lng: number }[]; task_id?: string; revision?: number; protocol_version?: number; config?: ActiveTaskConfig | null }
type StateMessage = { type: 'state'; udid: string; state: DeviceState; task?: WireTask | null }
type TaskSnapshotMessage = { type: 'task_snapshot'; tasks: WireTask[] }
type RestoredMessage = { type: 'restored'; udid: string }
type FlowerProgressMessage = { type: 'flower_progress'; udid: string; flower_index?: number; flower_total?: number; total_flowers?: number; circle?: number; round?: number; total_circles?: number; phase?: string; eta_seconds?: number; eta_scope?: 'total' | 'round'; lat?: number; lng?: number }
type StatusSnapshotMessage = {
  type: 'status_snapshot'
  tasks: TaskSnapshotMessage['tasks']
  positions: PositionMessage[]
  states: StateMessage[]
  flower_progress: FlowerProgressMessage[]
}
type Message = PositionMessage | StateMessage | RestoredMessage | FlowerProgressMessage | TaskSnapshotMessage | StatusSnapshotMessage

function activeTaskFromWire(task: WireTask): ActiveTask {
  return {
    kind: task.kind,
    path: task.path,
    taskId: task.task_id,
    revision: task.revision,
    protocolVersion: task.protocol_version,
    config: task.config,
  }
}

export function useWebSocket() {
  const [connected, setConnected] = useState(false)
  const [positions, setPositions] = useState<Record<string, LivePosition>>({})
  const [states, setStates] = useState<Record<string, DeviceState>>({})
  const [restoredAt, setRestoredAt] = useState<Record<string, number>>({})
  const [flowerProgress, setFlowerProgress] = useState<Record<string, FlowerProgress>>({})
  const [activeTasks, setActiveTasks] = useState<Record<string, ActiveTask>>({})
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectAttemptRef = useRef(0)
  const pendingPositionsRef = useRef<Map<string, PositionMessage>>(new Map())
  const pendingFlowerProgressRef = useRef<Map<string, FlowerProgressMessage>>(new Map())
  const pendingFlowerSnapshotRef = useRef<FlowerProgressMessage[] | null>(null)
  const flushFrameRef = useRef<number | null>(null)

  const flushTelemetry = useCallback(() => {
    if (document.visibilityState === 'hidden') return
    if (flushFrameRef.current !== null) cancelAnimationFrame(flushFrameRef.current)
    flushFrameRef.current = null

    const positionMessages = Array.from(pendingPositionsRef.current.values())
    pendingPositionsRef.current.clear()
    if (positionMessages.length) {
      setPositions((prev) => {
        const next = { ...prev }
        for (const message of positionMessages) {
          if (message.lat === null || message.lng === null) delete next[message.udid]
          else {
            next[message.udid] = {
              lat: message.lat,
              lng: message.lng,
              speedMps: message.speed_mps,
              etaSeconds: message.eta_seconds,
              stopIndex: message.stop_index,
            }
          }
        }
        return next
      })
    }

    const progressMessages = Array.from(pendingFlowerProgressRef.current.values())
    pendingFlowerProgressRef.current.clear()
    const progressSnapshot = pendingFlowerSnapshotRef.current
    pendingFlowerSnapshotRef.current = null
    if (progressSnapshot !== null || progressMessages.length) {
      setFlowerProgress((prev) => {
        const next = progressSnapshot === null ? { ...prev } : {}
        for (const message of [...(progressSnapshot ?? []), ...progressMessages]) {
          next[message.udid] = {
            flowerIndex: message.flower_index ?? 1,
            totalFlowers: message.flower_total ?? message.total_flowers ?? 1,
            circle: message.circle ?? message.round ?? 1,
            totalCircles: message.total_circles ?? 1,
            phase: message.phase ?? 'traveling',
            etaSeconds: message.eta_seconds ?? 0,
            etaScope: message.eta_scope ?? 'total',
            receivedAt: Date.now(),
          }
        }
        return next
      })
    }
  }, [])

  const scheduleTelemetryFlush = useCallback(() => {
    if (document.visibilityState === 'hidden' || flushFrameRef.current !== null) return
    flushFrameRef.current = requestAnimationFrame(flushTelemetry)
  }, [flushTelemetry])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let isUnmounted = false

    const requestStatusSync = () => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'status_sync' }))
      }
    }

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
        } else {
          requestStatusSync()
        }
      }

      socket.onclose = () => {
        setConnected(false)
        if (isUnmounted) return
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000)
        reconnectAttemptRef.current += 1
        timer = setTimeout(connect, delay)
      }

      socket.onerror = () => socket.close()

      socket.onmessage = (event) => {
        try {
          const message: Message = JSON.parse(event.data)
          if (message.type === 'position') {
            pendingPositionsRef.current.set(message.udid, message)
            scheduleTelemetryFlush()
          } else if (message.type === 'state') {
            setStates((prev) => ({ ...prev, [message.udid]: message.state }))
            if (message.task) setActiveTasks((prev) => {
              const incoming = activeTaskFromWire(message.task!)
              const current = prev[message.udid]
              if (current?.taskId && incoming.taskId === current.taskId && (incoming.revision ?? 0) < (current.revision ?? 0)) return prev
              return { ...prev, [message.udid]: incoming }
            })
            else if (message.state === 'idle') setActiveTasks((prev) => {
              if (!(message.udid in prev)) return prev
              const next = { ...prev }; delete next[message.udid]; return next
            })
            if (message.state === 'idle') {
              pendingFlowerProgressRef.current.delete(message.udid)
              setFlowerProgress((prev) => {
                if (!(message.udid in prev)) return prev
                const next = { ...prev }; delete next[message.udid]; return next
              })
            }
          } else if (message.type === 'task_snapshot') {
            setStates((prev) => ({ ...prev, ...Object.fromEntries(message.tasks.map((task) => [task.udid, task.state])) }))
            setActiveTasks(Object.fromEntries(message.tasks.map((task) => [task.udid, activeTaskFromWire(task)])))
          } else if (message.type === 'status_snapshot') {
            setStates((prev) => ({
              ...prev,
              ...Object.fromEntries(message.states.map((item) => [item.udid, item.state])),
              ...Object.fromEntries(message.tasks.map((task) => [task.udid, task.state])),
            }))
            setActiveTasks(Object.fromEntries(message.tasks.map((task) => [task.udid, activeTaskFromWire(task)])))
            for (const item of message.positions) pendingPositionsRef.current.set(item.udid, item)
            pendingFlowerProgressRef.current.clear()
            pendingFlowerSnapshotRef.current = message.flower_progress
            scheduleTelemetryFlush()
          } else if (message.type === 'restored') {
            setRestoredAt((prev) => ({ ...prev, [message.udid]: Date.now() }))
          } else if (message.type === 'flower_progress') {
            // Flower movement always emits the canonical position message
            // first. Do not synthesize a second position here: if the two
            // messages straddle frames it would overwrite live speed/ETA.
            pendingFlowerProgressRef.current.set(message.udid, message)
            scheduleTelemetryFlush()
          }
        } catch {
          // Ignore malformed messages; the next authoritative snapshot repairs state.
        }
      }
    }

    const restoreLatestState = () => {
      if (document.visibilityState === 'hidden') return
      flushTelemetry()
      requestStatusSync()
    }

    connect()
    document.addEventListener('visibilitychange', restoreLatestState)
    const unsubscribeRestore = window.electronAPI?.onWindowRestored(restoreLatestState)

    return () => {
      isUnmounted = true
      clearTimeout(timer)
      if (flushFrameRef.current !== null) cancelAnimationFrame(flushFrameRef.current)
      document.removeEventListener('visibilitychange', restoreLatestState)
      unsubscribeRestore?.()
      socketRef.current?.close()
    }
  }, [flushTelemetry, scheduleTelemetryFlush])

  const send = useCallback((type: string, data: unknown, udid?: string) => {
    socketRef.current?.send(JSON.stringify({ type, data, udid }))
  }, [])

  return { connected, positions, states, restoredAt, flowerProgress, activeTasks, send }
}
