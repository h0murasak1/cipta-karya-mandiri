import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
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
  const titleId = useId()

  // Callers pass inline arrows, so keep the latest onClose in a ref. Otherwise every
  // parent re-render would re-run the effect below: stealing focus from the field
  // being typed in and re-locking / re-scrolling the page.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cardRef.current?.focus()

    // Lock body scroll. A dialog opened on top of another one leaves the lock alone.
    const body = document.body
    const ownsLock = !body.classList.contains('dialog-open')
    const scrollY = window.scrollY
    const original = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      overflow: body.style.overflow,
    }
    if (ownsLock) {
      body.classList.add('dialog-open')
      body.style.position = 'fixed'
      body.style.top = `-${scrollY}px`
      body.style.left = '0'
      body.style.right = '0'
      body.style.overflow = 'hidden'
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Only the topmost dialog reacts to Escape.
      const dialogs = document.querySelectorAll('.dialog-card')
      if (dialogs[dialogs.length - 1] === cardRef.current) onCloseRef.current()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (ownsLock) {
        body.classList.remove('dialog-open')
        body.style.position = original.position
        body.style.top = original.top
        body.style.left = original.left
        body.style.right = original.right
        body.style.overflow = original.overflow
        window.scrollTo(0, scrollY)
      }
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true })
    }
  }, [])

  const dialogContent = (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={cardRef}
        tabIndex={-1}
      >
        <div className="dialog-drag-handle" aria-hidden="true" />
        <header className="dialog-heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p className="muted">{description}</p>}
          </div>
          <button
            type="button"
            className="icon-button dialog-close-btn"
            onClick={onClose}
            aria-label="Tutup dialog"
            title="Tutup dialog"
          >
            <X size={20} />
          </button>
        </header>
        <div className="dialog-body-content">
          {children}
        </div>
      </section>
    </div>
  )

  return createPortal(dialogContent, document.body)
}
