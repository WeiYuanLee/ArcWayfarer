import type { LatLng } from './types'

type Request = {
  fontUrl: string
  text: string
  center: LatLng
  widthMeters: number
  rotation: number
  toleranceMeters: number
}

type Result = { contours?: LatLng[][]; unsupported?: string[]; error?: string }
type Pending = { resolve: (result: Result) => void; reject: (error: Error) => void }

let worker: Worker | null = null
let nextRequestId = 0
const pending = new Map<number, Pending>()

function getWorker(): Worker {
  if (typeof Worker === 'undefined') throw new Error('worker-unavailable')
  if (worker) return worker
  worker = new Worker(new URL('./textPattern.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<Result & { id: number }>) => {
    const request = pending.get(event.data.id)
    if (!request) return
    pending.delete(event.data.id)
    request.resolve(event.data)
  }
  worker.onerror = () => {
    for (const request of pending.values()) request.reject(new Error('worker-failed'))
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

export function generateTextPatternOffThread(request: Request): Promise<Result> {
  return new Promise((resolve, reject) => {
    const requestId = ++nextRequestId
    try {
      pending.set(requestId, { resolve, reject })
      getWorker().postMessage({ ...request, id: requestId })
    } catch (error) {
      pending.delete(requestId)
      reject(error instanceof Error ? error : new Error('worker-unavailable'))
    }
  })
}
