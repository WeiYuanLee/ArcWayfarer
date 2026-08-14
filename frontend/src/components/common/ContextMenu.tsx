import { Menu } from '@mantine/core'

export type ContextMenuItem = {
  id: string
  label: string
  icon?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

type Props = {
  x: number
  y: number
  title?: string
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, title, items, onClose }: Props) {
  return (
    <Menu opened onChange={(opened) => { if (!opened) onClose() }} position="bottom-start" shadow="md" width={220} withinPortal zIndex={2100}>
      <Menu.Target>
        <span aria-hidden style={{ position: 'fixed', left: x, top: y, width: 1, height: 1, pointerEvents: 'none' }} />
      </Menu.Target>
      <Menu.Dropdown>
        {title && <Menu.Label>{title}</Menu.Label>}
        {items.map((item) => (
          <Menu.Item
            key={item.id}
            disabled={item.disabled}
            color={item.danger ? 'red' : undefined}
            leftSection={item.icon ? <span aria-hidden>{item.icon}</span> : undefined}
            onClick={() => { item.onClick(); onClose() }}
          >
            {item.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}
