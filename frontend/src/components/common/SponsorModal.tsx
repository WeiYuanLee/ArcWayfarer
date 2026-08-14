import { Button, Modal, Stack, Text } from '@mantine/core'
import { useT } from '../../i18n'

const LINK_TW = 'https://portaly.cc/lence0620/support'
const LINK_INTL = 'https://ko-fi.com/arcwayfarer'

type Props = { isOpen: boolean; onClose: () => void }

export function SponsorModal({ isOpen, onClose }: Props) {
  const t = useT()

  return (
    <Modal opened={isOpen} onClose={onClose} title={t('sponsor.title')} centered size="sm">
      <Text c="dimmed" size="sm" mb="xl">{t('sponsor.description')}</Text>
      <Stack gap="sm">
        <Button component="a" href={LINK_TW} target="_blank" rel="noopener noreferrer" color="green">
          {t('sponsor.cta_tw')}
        </Button>
        <Button component="a" href={LINK_INTL} target="_blank" rel="noopener noreferrer" color="red">
          {t('sponsor.cta_intl')}
        </Button>
        <Button variant="default" onClick={onClose}>{t('sponsor.close')}</Button>
      </Stack>
    </Modal>
  )
}
