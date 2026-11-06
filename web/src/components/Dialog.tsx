import { X } from 'lucide-react'

export function Dialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string
  description?: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <header className="dialog-heading">
          <div><h2 id="dialog-title">{title}</h2>{description && <p className="muted">{description}</p>}</div>
          <button className="icon-button" onClick={onClose} aria-label="Tutup dialog"><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  )
}
