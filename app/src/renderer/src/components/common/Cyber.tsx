/*
 * Bausteine im Seitenaufbau des cyberpunk-dashboard (raheem-dotgit/cyberpunk-dashboard @ 8ec7ec7,
 * `app/agent-network`, `app/operations`, `app/intelligence`; MIT laut README, siehe THIRD_PARTY_NOTICES.md):
 * Kennzahlkarten-Raster, Suchfeld, Detail-Dialog. Geändert: NEXORA-Farben, deutsche Texte,
 * ausschließlich echte Werte (die Vorlage nutzte feste Mockzahlen wie „847 ACTIVE AGENTS“).
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { cx } from '../../lib/format'

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-4">{children}</div>
}

export function StatCard({ label, value, icon: Icon, tone = 'default' }: { label: string; value: string | number; icon: typeof Search; tone?: 'default' | 'success' | 'warning' | 'danger' }) {
  const color = { default: 'text-text', success: 'text-success', warning: 'text-warning', danger: 'text-danger' }[tone]
  return (
    <div className="panel flex items-center justify-between p-4" role="group" aria-label={label}>
      <div>
        <p className="hud-label">{label}</p>
        <p className={cx('mt-1 font-mono text-2xl font-bold', color)}>{value}</p>
      </div>
      <Icon className={cx('size-7 opacity-80', color)} aria-hidden />
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <div className="panel relative p-3">
      <Search className="absolute left-6 top-1/2 size-4 -translate-y-1/2 text-text-2" aria-hidden />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} className="input w-full pl-9 text-sm" />
    </div>
  )
}

export function DetailModal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-base/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="panel max-h-[90vh] w-full max-w-3xl overflow-y-auto">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-text">{title}</h2>
            {subtitle && <p className="font-mono text-xs text-text-2">{subtitle}</p>}
          </div>
          <button type="button" className="btn-ghost -mr-2" onClick={onClose} aria-label="Schließen">
            <X className="size-5" aria-hidden />
          </button>
        </header>
        <div className="space-y-4 p-5">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="hud-label mb-1">{label}</p>
      <div className="text-sm text-text">{children}</div>
    </div>
  )
}
