import { createContext, useCallback, useContext, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

interface ToastItem {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

interface ToastContextValue {
  toast: (type: ToastItem['type'], message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [exiting, setExiting] = useState<Set<string>>(new Set())

  const removeToast = useCallback((id: string) => {
    setExiting((prev) => new Set(prev).add(id))
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      setExiting((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 280)
  }, [])

  const toast = useCallback((type: ToastItem['type'], message: string) => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev.slice(-4), { id, type, message }])
    setTimeout(() => removeToast(id), 4000)
  }, [removeToast])

  const icons = { success: CheckCircle2, error: AlertCircle, info: Info }

  return (
    <ToastContext value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-container" aria-live="polite">
          {toasts.map((t) => {
            const Icon = icons[t.type]
            return (
              <div key={t.id} className={`toast-item toast-${t.type} ${exiting.has(t.id) ? 'toast-exit' : ''}`} role="status">
                <Icon size={18} className="toast-icon" />
                <span className="toast-message">{t.message}</span>
                <button className="toast-close" onClick={() => removeToast(t.id)} aria-label="Tutup">
                  <X size={15} />
                </button>
                <div className="toast-progress" />
              </div>
            )
          })}
        </div>
      )}
    </ToastContext>
  )
}
