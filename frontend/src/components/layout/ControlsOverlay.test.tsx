// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Device } from '../../services/api'
import type { PanelProps } from '../panels/types'
import { ControlsOverlay } from './ControlsOverlay'

vi.mock('../ModeSelector', () => ({ ModeSelector: () => null }))
vi.mock('../../i18n', () => ({ useT: () => (key: string) => key }))
vi.mock('../map/PikminMapContext', () => ({
  usePikminMap: () => ({ mode: null }),
}))
vi.mock('../panels', async () => {
  const React = await import('react')
  function MockRoutePanel() {
    const [opened, setOpened] = React.useState(false)
    return React.createElement(
      React.Fragment,
      null,
      React.createElement('button', { type: 'button', onClick: () => setOpened(true) }, '開啟路徑收藏'),
      opened ? React.createElement('div', { role: 'dialog' }, '路徑收藏') : null,
    )
  }
  return {
    PANEL_BY_MODE: {
      teleport: MockRoutePanel,
      navigate: MockRoutePanel,
      'route-loop': MockRoutePanel,
      'multi-stop': MockRoutePanel,
      'random-walk': MockRoutePanel,
      joystick: MockRoutePanel,
    },
  }
})

const phoneA = {
  udid: 'Phone-A', name: 'A', ios_version: '18.0', transport: 'lockdown', connection_type: 'usb', status: 'ready',
} as Device
const phoneB = {
  udid: 'Phone-B', name: 'B', ios_version: '18.0', transport: 'lockdown', connection_type: 'wifi', status: 'ready',
} as Device

describe('ControlsOverlay device workspaces', () => {
  afterEach(cleanup)

  it('keeps A route UI mounted when B appears, and removes it only after A disappears', () => {
    const panelPropsFor = (deviceId: string) => ({ deviceId } as PanelProps)
    const view = render(
      <ControlsOverlay
        devices={[phoneA]}
        focusedDeviceId={phoneA.udid}
        modeByDevice={{ [phoneA.udid]: 'route-loop' }}
        onModeChange={vi.fn()}
        panelPropsFor={panelPropsFor}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '開啟路徑收藏' }))
    expect(screen.getByRole('dialog').textContent).toBe('路徑收藏')

    const phoneAFromAnotherTransport = { ...phoneA, udid: phoneA.udid.toUpperCase(), connection_type: 'wifi' as const }
    view.rerender(
      <ControlsOverlay
        devices={[phoneAFromAnotherTransport, phoneB]}
        focusedDeviceId={phoneA.udid}
        modeByDevice={{ [phoneA.udid]: 'route-loop' }}
        onModeChange={vi.fn()}
        panelPropsFor={panelPropsFor}
      />,
    )
    expect(screen.getByRole('dialog').textContent).toBe('路徑收藏')

    view.rerender(
      <ControlsOverlay
        devices={[phoneB]}
        focusedDeviceId={phoneB.udid}
        modeByDevice={{ [phoneB.udid]: 'route-loop' }}
        onModeChange={vi.fn()}
        panelPropsFor={panelPropsFor}
      />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
