import { Tooltip } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'

type Props = {
  description: string
}

export function ModeInfoTooltip({ description }: Props) {
  return (
    <Tooltip label={description} multiline w={260}>
      <span className="mode-info-icon" aria-label={description}><IconInfoCircle size={16} stroke={1.8} /></span>
    </Tooltip>
  )
}
