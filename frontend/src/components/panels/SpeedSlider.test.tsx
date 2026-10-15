// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SpeedSlider } from './SpeedSlider'

const mocks = vi.hoisted(() => ({
  warning: vi.fn(),
  getNavModeSpeeds: vi.fn(async () => ({ walk: 5 / 3.6, bike: 18.9 / 3.6, drive: 40 / 3.6 })),
}))

vi.mock('../../i18n', () => ({ useT: () => (key: string) => key }))
vi.mock('../../services/api', () => ({ getNavModeSpeeds: mocks.getNavModeSpeeds }))
vi.mock('../common/Toast', () => ({ notify: { warning: mocks.warning } }))

function Harness({ allowTurbo }: { allowTurbo?: boolean }) {
  const [speed, setSpeed] = useState(18.9)
  return (
    <MantineProvider>
      <SpeedSlider
        valueKmh={speed}
        navMode="bike"
        onChange={setSpeed}
        onNavModeChange={() => {}}
        allowTurbo={allowTurbo}
      />
    </MantineProvider>
  )
}

describe('SpeedSlider Turbo mode', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.warning.mockClear()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
  })

  afterEach(() => cleanup())

  it('only renders the Turbo control when explicitly enabled', () => {
    render(<Harness />)
    expect(screen.queryByRole('button', { name: 'speed.turbo_enable' })).toBeNull()
  })

  it('switches ranges without adding a speed heading and restores the normal speed', () => {
    const { container } = render(<Harness allowTurbo />)

    fireEvent.click(screen.getByRole('button', { name: 'speed.turbo_enable' }))
    expect(container.textContent).toContain('100 km/h')
    expect(container.textContent).toContain('speed.turbo')
    expect(screen.getByRole('radiogroup').getAttribute('data-disabled')).toBe('true')
    expect(screen.getByRole('slider').getAttribute('aria-valuemin')).toBe('100')
    expect(screen.getByRole('slider').getAttribute('aria-valuemax')).toBe('1000')
    expect(mocks.warning).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'speed.turbo_disable' }))
    expect(container.textContent).toContain('18.9 km/h')
    expect(screen.getByRole('radiogroup').getAttribute('data-disabled')).toBe('false')
    expect(screen.getByRole('slider').getAttribute('aria-valuemin')).toBe('1')
    expect(screen.getByRole('slider').getAttribute('aria-valuemax')).toBe('40')
  })

  it('shows the warning only on first activation', () => {
    render(<Harness allowTurbo />)
    fireEvent.click(screen.getByRole('button', { name: 'speed.turbo_enable' }))
    fireEvent.click(screen.getByRole('button', { name: 'speed.turbo_disable' }))
    fireEvent.click(screen.getByRole('button', { name: 'speed.turbo_enable' }))
    expect(mocks.warning).toHaveBeenCalledTimes(1)
  })
})
