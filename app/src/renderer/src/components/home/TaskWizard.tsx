import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useNexora } from '../../state/store'
import { WORKFLOWS } from '../../data/workflows'
import { TaskComposer } from '../task/TaskComposer'

/** Geführter Start einer Aufgabe von der Startseite aus. */
export function TaskWizard() {
  const id = useNexora((s) => s.wizard)
  const close = useNexora((s) => s.setWizard)
  const ref = useRef<HTMLDivElement>(null)
  const template = WORKFLOWS.find((w) => w.id === id)

  useEffect(() => {
    if (!id) return
    ref.current?.querySelector<HTMLElement>('button, input, textarea, select')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, close])

  if (!template) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-base/70 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && close(null)}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="wizard-title" className="panel w-[620px] max-w-[94vw] p-6">
        <div className="mb-1 flex items-start justify-between gap-4">
          <h2 id="wizard-title" className="text-xl font-semibold text-text">
            {template.simpleTitle}
          </h2>
          <button type="button" className="btn-ghost -mr-2 -mt-1" onClick={() => close(null)} aria-label="Schließen">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <p className="mb-5 text-sm text-text-2">{template.simpleText}</p>
        <ol className="mb-5 flex gap-2 text-xs text-text-2" aria-label="So funktioniert es">
          {['Auswählen', 'Erlauben', 'Starten – NEXORA fragt vor jeder Änderung'].map((t, i) => (
            <li key={t} className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-accent/20 text-[11px] font-semibold text-accent-hi">{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
        <TaskComposer key={template.id} fixedWorkflowId={template.id} simple onStarted={() => close(null)} />
      </div>
    </div>
  )
}
