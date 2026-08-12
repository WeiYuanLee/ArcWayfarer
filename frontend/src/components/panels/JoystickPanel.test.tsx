// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JoystickPanel } from './JoystickPanel'
import type { PanelProps } from './types'

vi.mock('../../i18n', () => ({ useT: () => (key: string) => key }))

describe('JoystickPanel speed modes', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  const defaultProps: PanelProps = {
    deviceId: 'dev-1',
    device: { status: 'ready', detail: '' } as any,
    deviceState: 'idle',
    point: { lat: 25.0, lng: 121.5 },
    livePosition: null,
    liveEtaSeconds: null,
    liveStopIndex: null,
    setPoint: vi.fn(),
    connected: true,
    requestPoint: vi.fn(),
    clearPoint: vi.fn(),
    setOverlay: vi.fn(),
    requestFlyTo: vi.fn(),
    sendWs: vi.fn(),
  }

  it('defaults to fixed-speed mode', () => {
    render(<JoystickPanel {...defaultProps} />)
    expect(screen.getByText('joystick.tab.basic')).toBeDefined()
    expect(screen.getByText('joystick.tab.dynamic')).toBeDefined()
  })

  it('shows a simple 0–60 km/h dynamic mode without curve controls', () => {
    render(<JoystickPanel {...defaultProps} />)
    fireEvent.click(screen.getAllByText('joystick.tab.dynamic')[0])
    expect(screen.getByText('joystick.dynamic.speed_range')).toBeDefined()
    expect(screen.getByText('0–60 km/h')).toBeDefined()
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})
