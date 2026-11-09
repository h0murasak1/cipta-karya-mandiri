import { useEffect } from 'react'
import type { Section } from '../lib/types'

const shortcuts: Record<string, Section> = {
  d: 'dashboard',
  p: 'projects',
  c: 'customers',
  i: 'invoices',
  t: 'transactions',
  r: 'reports',
  s: 'settings',
}

export function KeyboardShortcuts({ onNavigate }: { onNavigate: (section: Section) => void }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        const section = shortcuts[event.key.toLowerCase()]
        if (section) {
          event.preventDefault()
          onNavigate(section)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onNavigate])

  return null
}
