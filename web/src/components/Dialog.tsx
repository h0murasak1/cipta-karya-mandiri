import { useEffect, useRef } from 'react'
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
  const cardRef = useRef<HTMLElement>(null)

  useEffect(() => {
    // Focus the dialog card on mount
    cardRef.current?.focus()

    // Lock body scroll
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.overflow = 'hidden'

    // ESC to close
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.overflow = ''
      window.scrollTo(0, scrollY)
    }
  }, [onClose])

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        className="dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        ref={cardRef}
        tabIndex={-1}
      >
        <header className="dialog-heading">
          <div><h2 id="dialog-title">{title}</h2>{description && <p className="muted">{description}</p>}</div>
          <button className="icon-button" onClick={onClose} aria-label="Tutup dialog"><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  )
}
