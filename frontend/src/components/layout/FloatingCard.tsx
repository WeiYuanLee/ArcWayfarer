import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
}

export function FloatingCard({ children, className }: Props) {
  return <div className={`floating-card${className ? ` ${className}` : ''}`}>{children}</div>
}
