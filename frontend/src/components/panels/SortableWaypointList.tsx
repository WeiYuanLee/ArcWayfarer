import { useMemo, type MutableRefObject, type Ref } from 'react'
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ActionIcon, Badge, Group, Stack, Tooltip } from '@mantine/core'
import { IconGripVertical, IconTrash } from '@tabler/icons-react'
import type { WayPointItem } from '../../hooks/useWaypointList'
import type { LatLng } from './types'
import { CoordinateField } from './ui'
import { useT } from '../../i18n'

type Props = {
  items: WayPointItem[]
  badgeColor: string
  disabled: boolean
  minimumItems: number
  lastItemRef?: Ref<HTMLDivElement>
  requestPoint: (onPick: (lat: number, lng: number) => void) => void
  updateWaypoint: (index: number, point: LatLng) => void
  handleTextChange: (index: number, value: string) => void
  removeWaypoint: (index: number) => void
  reorderWaypoint: (fromIndex: number, toIndex: number) => void
}

type RowProps = Omit<Props, 'items' | 'reorderWaypoint' | 'lastItemRef'> & {
  item: WayPointItem
  index: number
  itemCount: number
  rowRef?: Ref<HTMLDivElement>
}

function SortableWaypointRow({
  item,
  index,
  itemCount,
  badgeColor,
  disabled,
  minimumItems,
  rowRef,
  requestPoint,
  updateWaypoint,
  handleTextChange,
  removeWaypoint,
}: RowProps) {
  const t = useT()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 1 : undefined,
  }
  const setRefs = (node: HTMLDivElement | null) => {
    setNodeRef(node)
    if (typeof rowRef === 'function') rowRef(node)
    else if (rowRef) (rowRef as MutableRefObject<HTMLDivElement | null>).current = node
  }
  const isInteractiveTarget = (target: EventTarget | null) => (
    target instanceof Element
    && Boolean(target.closest('input, button, textarea, select, a, [contenteditable="true"], [data-drag-handle]'))
  )

  return (
    <Group
      ref={setRefs}
      className={`route-loop-waypoint-row waypoint-sortable-row${isDragging ? ' is-dragging' : ''}`}
      wrap="nowrap"
      gap="xs"
      style={style}
      onMouseDown={(event) => {
        if (!disabled && !isInteractiveTarget(event.target)) listeners?.onMouseDown?.(event)
      }}
      onTouchStart={(event) => {
        if (!disabled && !isInteractiveTarget(event.target)) listeners?.onTouchStart?.(event)
      }}
    >
      <Tooltip label={t('waypoint.drag_hint')}>
        <ActionIcon
          data-drag-handle
          variant="subtle"
          color="gray"
          disabled={disabled}
          aria-label={t('waypoint.drag_hint')}
          className="waypoint-drag-handle"
          {...attributes}
          {...listeners}
        >
          <IconGripVertical size={17} />
        </ActionIcon>
      </Tooltip>
      <Badge variant="light" color={badgeColor} circle>{index + 1}</Badge>
      <CoordinateField
        size="xs"
        placeholder="lat, lng or URL"
        value={item.rawText}
        style={{ flex: 1 }}
        onFocus={() => requestPoint((lat, lng) => updateWaypoint(index, { lat, lng }))}
        onChange={(value) => handleTextChange(index, value)}
      />
      <ActionIcon
        color="red"
        variant="subtle"
        disabled={disabled || itemCount <= minimumItems}
        onClick={() => removeWaypoint(index)}
        title={t('panel.remove_waypoint')}
        aria-label={t('panel.remove_waypoint')}
      >
        <IconTrash size={16} />
      </ActionIcon>
    </Group>
  )
}

export function SortableWaypointList({ items, reorderWaypoint, lastItemRef, ...rowProps }: Props) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const itemIds = useMemo(() => items.map((item) => item.id), [items])

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return
    const fromIndex = items.findIndex((item) => item.id === event.active.id)
    const toIndex = items.findIndex((item) => item.id === event.over?.id)
    if (fromIndex !== -1 && toIndex !== -1) reorderWaypoint(fromIndex, toIndex)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <Stack gap="xs" className="route-loop-waypoint-list">
          {items.map((item, index) => (
            <SortableWaypointRow
              key={item.id}
              {...rowProps}
              item={item}
              index={index}
              itemCount={items.length}
              rowRef={index === items.length - 1 ? lastItemRef : undefined}
            />
          ))}
        </Stack>
      </SortableContext>
    </DndContext>
  )
}
