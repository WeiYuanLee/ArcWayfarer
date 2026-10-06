import { Anchor, Text } from '@mantine/core'

const PIKMIN_SOURCE_URL = 'https://pikmin.talllkai.com'

export function PikminSourceAttribution() {
  return (
    <Text size="xs" c="dimmed">
      資料來源：{' '}
      <Anchor href={PIKMIN_SOURCE_URL} target="_blank" rel="noreferrer" size="xs">
        皮克敏純點明信片地圖
      </Anchor>
    </Text>
  )
}
