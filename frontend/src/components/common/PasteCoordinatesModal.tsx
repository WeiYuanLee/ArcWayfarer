import { Button, Group, Modal, Textarea } from '@mantine/core'
import { useT } from '../../i18n'

type Props = {
  isOpen: boolean
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onClose: () => void
}

export function PasteCoordinatesModal({ isOpen, value, onChange, onSubmit, onClose }: Props) {
  const t = useT()

  return (
    <Modal opened={isOpen} onClose={onClose} title={t('multistop.paste_coords')} centered size="lg">
      <form onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
        <Textarea
          autoFocus
          autosize
          minRows={8}
          maxRows={14}
          placeholder={t('multistop.paste_placeholder')}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <Group justify="flex-end" mt="lg">
          <Button type="button" variant="default" onClick={onClose}>{t('multistop.paste_cancel')}</Button>
          <Button type="submit">{t('multistop.paste_submit')}</Button>
        </Group>
      </form>
    </Modal>
  )
}
