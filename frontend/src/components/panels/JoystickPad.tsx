import { useEffect, useRef, useState } from 'react'
import { DEFAULT_DEADZONE } from '../../utils/joystickPhysics'

const PAD_RADIUS = 75
const HANDLE_RADIUS = 24
const MAX_DISTANCE = PAD_RADIUS - HANDLE_RADIUS

type Props = {
  onMove: (direction: number, intensity: number) => void
  dynamic?: boolean
  maxSpeedKmh?: number
}

export function JoystickPad({ onMove, dynamic = false, maxSpeedKmh }: Props) {
  const padRef = useRef<HTMLDivElement>(null)
  const [handlePos, setHandlePos] = useState({ x: 0, y: 0 })
  const [compassAngle, setCompassAngle] = useState(0)
  const [intensity, setIntensity] = useState(0)
  const [activeKeys, setActiveKeys] = useState<{ w: boolean; a: boolean; s: boolean; d: boolean }>({
    w: false,
    a: false,
    s: false,
    d: false,
  })

  const animFrameRef = useRef<number | null>(null)
  const pendingInputRef = useRef<{ dir: number; int: number } | null>(null)

  // Listen to keyboard keys for WASD visual feedback overlay
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const k = e.key.toLowerCase()
      if (k === 'w' || k === 'a' || k === 's' || k === 'd' || k.startsWith('arrow')) {
        setActiveKeys((prev) => ({
          w: k === 'w' || k === 'arrowup' ? true : prev.w,
          a: k === 'a' || k === 'arrowleft' ? true : prev.a,
          s: k === 's' || k === 'arrowdown' ? true : prev.s,
          d: k === 'd' || k === 'arrowright' ? true : prev.d,
        }))
      }
    }
    function handleKeyUp(e: KeyboardEvent) {
      const k = e.key.toLowerCase()
      if (k === 'w' || k === 'arrowup') setActiveKeys((p) => ({ ...p, w: false }))
      if (k === 'a' || k === 'arrowleft') setActiveKeys((p) => ({ ...p, a: false }))
      if (k === 's' || k === 'arrowdown') setActiveKeys((p) => ({ ...p, s: false }))
      if (k === 'd' || k === 'arrowright') setActiveKeys((p) => ({ ...p, d: false }))
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  function scheduleEmit(dir: number, int: number) {
    pendingInputRef.current = { dir, int }
    if (animFrameRef.current !== null) return
    animFrameRef.current = requestAnimationFrame(() => {
      animFrameRef.current = null
      if (pendingInputRef.current) {
        onMove(pendingInputRef.current.dir, pendingInputRef.current.int)
      }
    })
  }

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

    const rawIntensity = clamped / MAX_DISTANCE
    // Basic mode uses the configured speed as soon as the stick leaves the deadzone.
    // Dynamic mode maps the stick's full travel directly to 0–60 km/h.
    const currentIntensity = rawIntensity <= DEFAULT_DEADZONE ? 0 : dynamic ? rawIntensity : 1

    const compassDeg = (Math.atan2(dx, dy) * 180) / Math.PI
    const direction = Math.round(((compassDeg % 360) + 360) % 360)

    const scale = distance > 0 ? clamped / distance : 0
    setHandlePos({ x: dx * scale, y: -dy * scale })
    setCompassAngle(direction)
    setIntensity(currentIntensity)
    scheduleEmit(direction, currentIntensity)
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
    setIntensity(0)
    scheduleEmit(0, 0)
  }

  const effectiveSpeed = maxSpeedKmh !== undefined ? (maxSpeedKmh * intensity).toFixed(1) : null

  return (
    <div className="cyber-joystick-wrapper">
      <div className="joystick-telemetry-header">
        <span className="telemetry-angle">{intensity > 0 ? `${compassAngle}°` : '0° N'}</span>
        <span className="telemetry-intensity">
          {intensity > 0
            ? effectiveSpeed
              ? `${effectiveSpeed} km/h${dynamic ? ` (${Math.round(intensity * 100)}%)` : ''}`
              : `${Math.round(intensity * 100)}% POWER`
            : 'IDLE'}
        </span>
      </div>

      <div
        ref={padRef}
        className="cyber-joystick-pad"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Outer 360 Compass Ring Ticks */}
        <div className="compass-ring">
          <span className="compass-tick tick-n">N</span>
          <span className="compass-tick tick-e">E</span>
          <span className="compass-tick tick-s">S</span>
          <span className="compass-tick tick-w">W</span>
        </div>

        {/* WASD Key overlay indicators */}
        <div className={`wasd-indicator key-w ${activeKeys.w ? 'active' : ''}`}>W</div>
        <div className={`wasd-indicator key-a ${activeKeys.a ? 'active' : ''}`}>A</div>
        <div className={`wasd-indicator key-s ${activeKeys.s ? 'active' : ''}`}>S</div>
        <div className={`wasd-indicator key-d ${activeKeys.d ? 'active' : ''}`}>D</div>

        {/* Central Joystick Knob */}
        <div
          className={`cyber-joystick-knob ${intensity > 0 ? 'active' : ''}`}
          style={{ transform: `translate(${handlePos.x}px, ${handlePos.y}px)` }}
        >
          <div className="knob-core-glow" />
        </div>
      </div>
    </div>
  )
}
