import { Button, Image, Modal, Stack, Text } from '@mantine/core'
import { useT } from '../../i18n'

const LINE_COMMUNITY_URL = 'https://line.me/ti/g2/tOr5n5DUsUNZUb6J3yJlkaPpyJqq4tQkF_slRg?utm_source=invitation&utm_medium=link_copy&utm_campaign=default'
const QR_CODE_URL = './community/line-community-qr.jpg'

type Props = { isOpen: boolean; onClose: () => void }

export function CommunityModal({ isOpen, onClose }: Props) {
  const t = useT()

  function openCommunity() {
    if (window.electronAPI?.openExternal) {
      void window.electronAPI.openExternal(LINE_COMMUNITY_URL)
    } else {
      window.open(LINE_COMMUNITY_URL, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <Modal opened={isOpen} onClose={onClose} title={t('community.title')} centered size="sm">
      <Stack align="center" gap="md">
        <Text c="dimmed" size="sm" ta="center">{t('community.description')}</Text>
        <Image src={QR_CODE_URL} alt={t('community.qr_alt')} w={170} h={170} fit="contain" />
        <Button fullWidth color="green" onClick={openCommunity}>{t('community.open_line')}</Button>
        <Button variant="default" onClick={onClose}>{t('generic.close')}</Button>
      </Stack>
    </Modal>
  )
}
