import { lazy, type ComponentType } from 'react'
import type { Mode } from '../ModeSelector'
import type { PanelProps } from './types'

const lazyPanel = (loader: () => Promise<unknown>, exportName: string) =>
  lazy(async () => {
    const module = await loader() as Record<string, ComponentType<PanelProps>>
    return { default: module[exportName] }
  })

export const PANEL_BY_MODE: Record<Mode, ComponentType<PanelProps>> = {
  teleport: lazyPanel(() => import('./TeleportPanel'), 'TeleportPanel'),
  navigate: lazyPanel(() => import('./NavigatePanel'), 'NavigatePanel'),
  'route-loop': lazyPanel(() => import('./RouteLoopPanel'), 'RouteLoopPanel'),
  'multi-stop': lazyPanel(() => import('./MultiStopPanel'), 'MultiStopPanel'),
  'random-walk': lazyPanel(() => import('./RandomWalkPanel'), 'RandomWalkPanel'),
  joystick: lazyPanel(() => import('./JoystickPanel'), 'JoystickPanel'),
}
