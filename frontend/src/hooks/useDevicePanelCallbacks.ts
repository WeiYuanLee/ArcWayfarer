import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import type { LatLng, PanelProps } from '../components/panels/types'

type PointByDevice = Record<string, LatLng | null>
type PointCallbacks = Pick<PanelProps, 'setPoint' | 'requestPoint' | 'clearPoint'>

/**
 * Keeps panel action props stable for the lifetime of a device workspace.
 *
 * Several panels publish their map overlay from an effect. Recreating these
 * callbacks on every App render makes that effect publish a new overlay, which
 * renders App again and creates an unbounded update loop.
 */
export function useDevicePanelCallbacks(
  setPointByDevice: Dispatch<SetStateAction<PointByDevice>>,
  requestPointForDevice: (deviceId: string, onPick: (lat: number, lng: number) => void) => void,
) {
  const callbacksRef = useRef(new Map<string, PointCallbacks>())

  return useCallback((deviceId: string): PointCallbacks => {
    const existing = callbacksRef.current.get(deviceId)
    if (existing) return existing

    const callbacks: PointCallbacks = {
      setPoint: (point) => setPointByDevice((current) => ({ ...current, [deviceId]: point })),
      requestPoint: (onPick) => requestPointForDevice(deviceId, onPick),
      clearPoint: () => setPointByDevice((current) => ({ ...current, [deviceId]: null })),
    }
    callbacksRef.current.set(deviceId, callbacks)
    return callbacks
  }, [requestPointForDevice, setPointByDevice])
}
