import { useMemo, useState } from 'react'
import { Alert, Button, Checkbox, FileButton, Group, Modal, Stack, Text } from '@mantine/core'
import { IconAlertCircle, IconDownload, IconFileUpload } from '@tabler/icons-react'
import { useT, type StringKey } from '../../i18n'
import { exportFavorites, importFavorites, previewFavoriteImport, type FavoriteExportDocument, type FavoriteImportPreview } from '../../services/api'

type TransferMode = 'export' | 'import'

type Props = {
  mode: TransferMode | null
  groups: string[]
  onClose: () => void
  onImported: () => Promise<unknown>
}

function format(t: (key: StringKey) => string, key: StringKey, values: Record<string, unknown>) {
  return Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), t(key))
}

function download(exportDocument: FavoriteExportDocument) {
  const blob = new Blob([JSON.stringify(exportDocument, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = `arcwayfarer-favorites-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function FavoriteTransferModal({ mode, groups, onClose, onImported }: Props) {
  const t = useT()
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(() => new Set(groups))
  const [preview, setPreview] = useState<FavoriteImportPreview | null>(null)
  const [importDocument, setImportDocument] = useState<FavoriteExportDocument | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const groupList = useMemo(() => [...groups].sort((a, b) => (a || '\uffff').localeCompare(b || '\uffff')), [groups])

  const close = () => {
    setPreview(null)
    setImportDocument(null)
    setError(null)
    setSuccess(null)
    onClose()
  }

  const toggleGroup = (group: string) => {
    setSelectedGroups((current) => {
      const next = new Set(current)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  const handleExport = async () => {
    setWorking(true)
    setError(null)
    try {
      download(await exportFavorites([...selectedGroups]))
      close()
    } catch {
      setError(t('favorites.transfer.failed'))
    } finally {
      setWorking(false)
    }
  }

  const handleFile = async (file: File | null) => {
    if (!file) return
    setError(null)
    setPreview(null)
    setImportDocument(null)
    if (file.size > 5 * 1024 * 1024) {
      setError(t('favorites.transfer.invalid_file'))
      return
    }
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!parsed || typeof parsed !== 'object' || (parsed as { format?: unknown }).format !== 'arcwayfarer-favorites') {
        throw new Error('invalid format')
      }
      const document = parsed as FavoriteExportDocument
      setWorking(true)
      const nextPreview = await previewFavoriteImport(document)
      setImportDocument(document)
      setPreview(nextPreview)
    } catch {
      setError(t('favorites.transfer.invalid_file'))
    } finally {
      setWorking(false)
    }
  }

  const handleImport = async () => {
    if (!importDocument) return
    setWorking(true)
    setError(null)
    try {
      const result = await importFavorites(importDocument)
      await onImported()
      setSuccess(format(t, 'favorites.transfer.success', { count: result.imported, duplicates: result.duplicates }))
      setPreview(null)
      setImportDocument(null)
    } catch {
      setError(t('favorites.transfer.failed'))
    } finally {
      setWorking(false)
    }
  }

  const exportMode = mode === 'export'
  return (
    <Modal opened={mode !== null} onClose={close} title={exportMode ? t('favorites.transfer.export_title') : t('favorites.transfer.import_title')} centered>
      <Stack gap="md">
        {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
        {success && <Alert color="green">{success}</Alert>}
        {exportMode ? (
          <>
            <Text size="sm">{t('favorites.transfer.select_groups')}</Text>
            <Group gap="xs">
              <Button size="xs" variant="default" onClick={() => setSelectedGroups(new Set(groupList))}>{t('favorites.transfer.select_all')}</Button>
              <Button size="xs" variant="subtle" onClick={() => setSelectedGroups(new Set())}>{t('favorites.transfer.clear_all')}</Button>
            </Group>
            <Stack gap="xs">
              {groupList.map((group) => <Checkbox key={group || '__ungrouped__'} checked={selectedGroups.has(group)} onChange={() => toggleGroup(group)} label={group || t('favorites.ungrouped')} />)}
            </Stack>
            <Button leftSection={<IconDownload size={16} />} onClick={() => void handleExport()} loading={working} disabled={selectedGroups.size === 0}>{t('favorites.transfer.download')}</Button>
          </>
        ) : (
          <>
            {!preview && !success && <FileButton onChange={(file) => void handleFile(file)} accept="application/json,.json">{(props) => <Button {...props} leftSection={<IconFileUpload size={16} />} loading={working}>{t('favorites.transfer.choose_file')}</Button>}</FileButton>}
            {preview && (
              <Alert color="blue" title={t('favorites.transfer.preview')}>
                <Stack gap="xs">
                  <Text size="sm">{format(t, 'favorites.transfer.preview_summary', { total: preview.total, additions: preview.additions, duplicates: preview.duplicates })}</Text>
                  {preview.groups_to_add.length > 0 && <Text size="sm">{format(t, 'favorites.transfer.groups_to_add', { groups: preview.groups_to_add.join('、') })}</Text>}
                  <Text size="sm">{t('favorites.transfer.keep_existing')}</Text>
                  <Group justify="flex-end">
                    <FileButton onChange={(file) => void handleFile(file)} accept="application/json,.json">{(props) => <Button {...props} size="xs" variant="default">{t('favorites.transfer.choose_file')}</Button>}</FileButton>
                    <Button size="xs" onClick={() => void handleImport()} loading={working}>{t('favorites.transfer.confirm_import')}</Button>
                  </Group>
                </Stack>
              </Alert>
            )}
          </>
        )}
      </Stack>
    </Modal>
  )
}
