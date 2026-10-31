import { FlaskConical, X } from 'lucide-react'
import { useNexora } from '../../state/store'
import { exitDemo } from '../../demo/controller'

/** Dauerhaft sichtbar, solange der Demo-Modus aktiv ist. */
export function DemoBanner() {
  const demoMode = useNexora((s) => s.demoMode)
  if (!demoMode) return null
  return (
    <div role="status" className="flex items-center gap-3 border-b border-warning/40 bg-warning/10 px-5 py-1.5 text-xs text-warning">
      <FlaskConical className="size-4" aria-hidden />
      <strong className="tracking-widest">DEMO-MODUS</strong>
      <span className="text-warning/90">
        Alle Abläufe, Kosten und Ergebnisse sind simuliert. Es werden keine Dateien verändert und nichts versendet.
      </span>
      <button type="button" onClick={exitDemo} className="ml-auto inline-flex items-center gap-1 rounded px-2 py-0.5 hover:bg-warning/15">
        <X className="size-3.5" aria-hidden /> Demo beenden
      </button>
    </div>
  )
}
