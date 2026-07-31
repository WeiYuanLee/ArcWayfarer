import { useRef, useState } from 'react'

const PAD_RADIUS = 70
const HANDLE_RADIUS = 22
const MAX_DISTANCE = PAD_RADIUS - HANDLE_RADIUS

type Props = {
  onMove: (direction: number, intensity: number) => void
}

export function JoystickPad({ onMove }: Props) {
  const padRef = useRef<HTMLDivElement>(null)
  const [handlePos, setHandlePos] = useState({ x: 0, y: 0 })

  function calcFromEvent(clientX: number, clientY: number) {
    const pad = padRef.current
    if (!pad) return
    const rect = pad.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const dx = clientX - centerX
    const dy = centerY - clientY // invert Y so up is positive
    const distance = Math.hypot(dx, dy)
    const clamped = Math.min(distance, MAX_DISTANCE)
    const intensity = clamped / MAX_DISTANCE
    const compassDeg = (Math.atan2(dx, dy) * 180) / Math.PI
    const direction = ((compassDeg % 360) + 360) % 360

    const scale = distance > 0 ? clamped / distance : 0
    setHandlePos({ x: dx * scale, y: -dy * scale })
    onMove(Math.round(direction), intensity)
  }

  function handlePointerDown(e: React.PointerEvent) {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    calcFromEvent(e.clientX, e.clientY)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (e.buttons === 0) return
    calcFromEvent(e.clientX, e.clientY)
  }

  function handlePointerUp() {
    setHandlePos({ x: 0, y: 0 })
    onMove(0, 0)
  }

  return (
    <div
      ref={padRef}
      className="joystick-pad"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        className="joystick-handle"
        style={{ transform: `translate(${handlePos.x}px, ${handlePos.y}px)` }}
      />
    </div>
  )
}
