import { useCallback, useEffect, useState } from 'react'
import { checkForUpdates, type CheckUpdateResult } from '../services/updateService'

export function useUpdateChecker() {
  const [checkResult, setCheckResult] = useState<CheckUpdateResult | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [modalOpen, setModalOpen] = useState<boolean>(false)

  const performCheck = useCallback(async () => {
    setLoading(true)
    try {
      const result = await checkForUpdates()
      setCheckResult(result)
    } catch (err) {
      console.error('Error checking for updates:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Check automatically on mount
  useEffect(() => {
    performCheck()
  }, [performCheck])

  const openUpdateModal = useCallback(() => {
    setModalOpen(true)
  }, [])

  const closeUpdateModal = useCallback(() => {
    setModalOpen(false)
  }, [])

  return {
    checkResult,
    loading,
    modalOpen,
    performCheck,
    openUpdateModal,
    closeUpdateModal,
    hasUpdate: checkResult?.hasUpdate ?? false,
    currentVersion: checkResult?.currentVersion || '0.1.0',
    latestVersion: checkResult?.latestRelease?.version,
  }
}
