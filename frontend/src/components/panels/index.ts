import type { Mode } from '../ModeSelector'
import type { PanelProps } from './types'
import { TeleportPanel } from './TeleportPanel'
import { NavigatePanel } from './NavigatePanel'
import { RouteLoopPanel } from './RouteLoopPanel'
import { MultiStopPanel } from './MultiStopPanel'
import { RandomWalkPanel } from './RandomWalkPanel'
import { JoystickPanel } from './JoystickPanel'

export const PANEL_BY_MODE: Record<Mode, (props: PanelProps) => JSX.Element> = {
  teleport: TeleportPanel,
  navigate: NavigatePanel,
  'route-loop': RouteLoopPanel,
  'multi-stop': MultiStopPanel,
  'random-walk': RandomWalkPanel,
  joystick: JoystickPanel,
}
