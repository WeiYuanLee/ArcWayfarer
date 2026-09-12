import { ActionIcon, type ActionIconProps } from '@mantine/core'
import type { MouseEventHandler, ReactNode } from 'react'

type Props = ActionIconProps & {
  children?: ReactNode
  className?: string
  onClick?: MouseEventHandler<HTMLButtonElement>
  'aria-label'?: string
}

/**
 * Shared contract for controls rendered over either map engine. Native map
 * controls receive the same class after their DOM is created.
 */
export function MapControlButton({ className = '', ...props }: Props) {
  return <ActionIcon {...props} className={`map-control-button ${className}`.trim()} />
}
