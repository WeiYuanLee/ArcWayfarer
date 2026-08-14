import { Button, Group, Modal, Text } from '@mantine/core'
import { useT } from '../../i18n'

type Props = {
  isOpen: boolean
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({ isOpen, title, description, confirmText, cancelText, danger = true, onConfirm, onCancel }: Props) {
  const t = useT()

  return (
    <Modal opened={isOpen} onClose={onCancel} title={title} centered size="sm">
      <Text c="dimmed" size="sm">{description}</Text>
      <Group justify="flex-end" mt="xl">
        <Button variant="default" onClick={onCancel}>{cancelText || t('confirm.cancel')}</Button>
        <Button color={danger ? 'red' : undefined} onClick={() => { onConfirm(); onCancel() }}>
          {confirmText || t('confirm.confirm')}
        </Button>
      </Group>
    </Modal>
  )
}
