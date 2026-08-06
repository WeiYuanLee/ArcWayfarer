import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

let toastListener: ((msg: string) => void) | null = null

export function showToast(message: string) {
  if (toastListener) toastListener(message)
}

export function ToastContainer() {
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    toastListener = (msg: string) => {
      setToast(msg)
      setTimeout(() => {
        setToast(null)
      }, 2500)
    }
    return () => {
      toastListener = null
    }
  }, [])

  if (!toast) return null

  return createPortal(
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(30, 30, 36, 0.95)',
        color: '#ffffff',
        border: '1px solid #4a9af0',
        borderRadius: '20px',
        padding: '8px 18px',
        fontSize: '13px',
        fontWeight: 500,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
        zIndex: 10000,
        pointerEvents: 'none',
        backdropFilter: 'blur(4px)',
      }}
    >
      {toast}
    </div>,
    document.body
  )
}
