import { useState } from 'react'
import { Play, Info } from 'lucide-react'
import { useNexora } from '../../state/store'
import { WORKFLOWS } from '../../data/workflows'
import { enterDemo, startDemoScenario } from '../../demo/controller'

export function TaskComposer() {
  const demoMode = useNexora((s) => s.demoMode)
  const [workflowId, setWorkflowId] = useState(WORKFLOWS[0]!.id)
  const [text, setText] = useState('')
  const workflow = WORKFLOWS.find((w) => w.id === workflowId)!
  const canStartDemo = demoMode && !!workflow.demoScenarioId

  return (
    <form
      data-testid="task-composer"
      className="panel flex min-w-0 flex-col gap-3 p-4"
      aria-label="Neue Aufgabe"
      onSubmit={(e) => {
        e.preventDefault()
        if (canStartDemo && workflow.demoScenarioId) {
          startDemoScenario(workflow.demoScenarioId)
          setText('')
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="hud-label">Neue Aufgabe</h2>
        <label className="flex items-center gap-2 text-xs text-text-2">
          Vorlage
          <select value={workflowId} onChange={(e) => setWorkflowId(e.target.value)} className="input py-1 text-xs">
            {WORKFLOWS.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder={`z. B. „${workflow.description}“`}
        aria-label="Aufgabe in natürlicher Sprache"
        className="input min-h-16 flex-1 resize-none text-sm"
      />
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-2">
        <span>Benötigt:</span>
        {workflow.capabilities.map((c) => (
          <span key={c} className="rounded border border-line px-1.5 py-0.5">
            {c}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {!demoMode && (
          <p className="flex flex-1 items-start gap-1.5 text-xs text-text-2">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden />
            Echte Ausführung folgt ab {workflow.livePhase}, sobald der lokale Worker angebunden ist. Du kannst den Ablauf vorher im Demo-Modus ansehen.
          </p>
        )}
        {demoMode && !workflow.demoScenarioId && (
          <p className="flex-1 text-xs text-text-2">Für diese Vorlage gibt es noch keine Demo.</p>
        )}
        {demoMode && workflow.demoScenarioId && <p className="flex-1 text-xs text-warning">Startet einen simulierten DEMO-Lauf.</p>}
        {!demoMode ? (
          <button type="button" className="btn-secondary" onClick={enterDemo}>
            Demo-Modus öffnen
          </button>
        ) : (
          <button type="submit" className="btn-primary" disabled={!canStartDemo}>
            <Play className="size-4" aria-hidden /> Demo starten
          </button>
        )}
      </div>
    </form>
  )
}
