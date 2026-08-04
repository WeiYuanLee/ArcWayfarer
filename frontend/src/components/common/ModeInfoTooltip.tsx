import { useState } from 'react'

type Props = {
  description: string
}

export function ModeInfoTooltip({ description }: Props) {
  const [show, setShow] = useState(false)

  return (
    <span
      className="mode-info-tooltip-wrapper"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="mode-info-icon">ⓘ</span>
      {show && <span className="mode-info-popover">{description}</span>}
    </span>
  )
}
