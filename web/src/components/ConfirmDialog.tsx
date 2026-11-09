import { AlertTriangle } from 'lucide-react'
import { Dialog } from './Dialog'

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog title={title} onClose={onCancel}>
      <div className="confirm-dialog-body">
        <div className="confirm-dialog-icon">
          <AlertTriangle size={22} />
        </div>
        <p className="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          <button className="button button-secondary" type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button className={`button ${danger ? 'button-danger' : 'button-primary'}`} type="button" onClick={onConfirm} disabled={busy}>
            {busy ? 'Memproses...' : confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
