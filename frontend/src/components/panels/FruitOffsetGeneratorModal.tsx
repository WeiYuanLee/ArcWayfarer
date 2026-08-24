import { useMemo, useState } from 'react'
import { Box, Button, Group, Modal, ScrollArea, Slider, Stack, Text, Tooltip } from '@mantine/core'
import { IconCopy, IconDownload, IconInfoCircle, IconRefresh } from '@tabler/icons-react'
import type { LatLng } from './types'
import { downloadFruitOffsetsGpx, formatFruitOffsetText, generateFruitOffsets, type FruitOffsetPoint } from './fruitOffset'

type Props = { opened: boolean; onClose: () => void; flowers: LatLng[] }

function FruitOffsetMiniPreview({ points }: { points: FruitOffsetPoint[] }) {
  if (!points.length) return null
  const coordinates = points.flatMap(({ flower, point }) => [flower, point])
  const minLat = Math.min(...coordinates.map(({ lat }) => lat))
  const maxLat = Math.max(...coordinates.map(({ lat }) => lat))
  const minLng = Math.min(...coordinates.map(({ lng }) => lng))
  const maxLng = Math.max(...coordinates.map(({ lng }) => lng))
  const latRange = Math.max(maxLat - minLat, 0.00001)
  const lngRange = Math.max(maxLng - minLng, 0.00001)
  const project = ({ lat, lng }: LatLng) => ({ x: 14 + ((lng - minLng) / lngRange) * 252, y: 12 + ((maxLat - lat) / latRange) * 48 })

  return (
    <Box aria-label="領果位移預覽" style={{ position: 'relative', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8, overflow: 'hidden', background: 'var(--mantine-color-gray-0)' }}>
      <svg viewBox="0 0 280 72" width="100%" height="72" role="img" aria-label="粉紅點為花朵中心，綠點為建議領果位置" style={{ display: 'block', maxWidth: '100%' }}>
        {points.map(({ id, flower, point }) => {
          const from = project(flower)
          const to = project(point)
          return <g key={id}>
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#7185aa" strokeWidth="1.25" strokeOpacity="0.6" strokeDasharray="3 3" />
            <circle cx={from.x} cy={from.y} r="3.8" fill="#f06292" stroke="#fff" strokeWidth="1.5" />
            <circle cx={to.x} cy={to.y} r="3.8" fill="#62a850" stroke="#fff" strokeWidth="1.5" />
          </g>
        })}
      </svg>
      <Group gap="md" px="xs" pb={6} fz="xs" c="dimmed">
        <Group gap={4}><Box component="span" style={{ width: 7, height: 7, borderRadius: '50%', background: '#f06292' }} />花朵中心</Group>
        <Group gap={4}><Box component="span" style={{ width: 7, height: 7, borderRadius: '50%', background: '#62a850' }} />建議領果點</Group>
      </Group>
      <Text size="xs" c="dimmed" style={{ position: 'absolute', right: 8, bottom: 6 }}>位移分布預覽</Text>
    </Box>
  )
}

/** A client-only helper for generating and sharing randomly offset fruit coordinates. */
export function FruitOffsetGeneratorModal({ opened, onClose, flowers }: Props) {
  const [distanceMeters, setDistanceMeters] = useState(35)
  const [seed, setSeed] = useState(() => String(Date.now()))
  const results = useMemo(() => generateFruitOffsets(flowers, { distanceMeters, seed }), [flowers, distanceMeters, seed])
  const copy = async () => navigator.clipboard.writeText(formatFruitOffsetText(results, distanceMeters))
  const coordinateRows = <Stack gap={4} pr="xs">
    {results.map(({ id, flowerIndex, point }) => <Group key={id} justify="space-between" wrap="nowrap" style={{ padding: '2px 4px' }}>
      <Text size="xs" c="dimmed">花朵 {flowerIndex + 1}</Text>
      <Text size="xs" ff="monospace">{point.lat.toFixed(6)}, {point.lng.toFixed(6)}</Text>
    </Group>)}
  </Stack>

  return (
    <Modal opened={opened} onClose={onClose} centered size="md" styles={{ body: { overflowX: 'hidden' } }} title={<Group gap={6}><span>產生建議領果座標</span><Tooltip label="依目前花朵中心隨機產生位移座標；可複製或匯出，不會變更種花路線。" multiline w={260} withinPortal zIndex={10000} position="bottom-start"><span className="mode-info-icon" aria-label="領果座標工具說明"><IconInfoCircle size={16} stroke={1.8} /></span></Tooltip></Group>}>
      <Stack gap="md">
        <Stack gap={4}>
          <Group justify="space-between"><Text size="sm">位移距離</Text><Text size="sm" fw={600}>{distanceMeters} m</Text></Group>
          <Slider mb={8} min={25} max={50} step={1} value={distanceMeters} onChange={setDistanceMeters} marks={[{ value: 25, label: '25m' }, { value: 35, label: '35m' }, { value: 50, label: '50m' }]} />
        </Stack>
        <FruitOffsetMiniPreview points={results} />
        <Stack gap={4}>
          <Text size="sm" fw={600}>建議領果座標（{results.length} 個）</Text>
          {results.length > 4 ? <ScrollArea h={112} type="hover" scrollbars="y">{coordinateRows}</ScrollArea> : coordinateRows}
        </Stack>
        <Group grow>
          <Button variant="default" leftSection={<IconRefresh size={16} />} onClick={() => setSeed(String(Date.now()))} disabled={!results.length}>重新產生</Button>
          <Button leftSection={<IconCopy size={16} />} onClick={() => void copy()} disabled={!results.length}>複製座標</Button>
          <Button variant="default" leftSection={<IconDownload size={16} />} onClick={() => downloadFruitOffsetsGpx(results)} disabled={!results.length}>匯出 GPX</Button>
        </Group>
        <Text size="xs" c="dimmed">位移點僅供分享與採集輔助，實際可拾取位置仍取決於遊戲狀態。</Text>
      </Stack>
    </Modal>
  )
}
