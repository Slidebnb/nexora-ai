import { useState } from 'react'
import { Info, Play } from 'lucide-react'
import { useNexora } from '../../state/store'
import { WORKFLOWS, type WorkflowTemplate } from '../../data/workflows'
import { enterDemo, startDemoScenario } from '../../demo/controller'
import { cleanError } from '../../lib/actions'
import { CAPABILITY_LABEL } from '@shared/ipc-contract'
import { buildRequest, LiveForm } from './LiveForms'

/** Startet echte Aufgaben über den Worker (Live) oder simulierte Abläufe (Demo). */
export function TaskComposer() {
  const demoMode = useNexora((s) => s.demoMode)
  const worker = useNexora((s) => s.worker)
  const [workflowId, setWorkflowId] = useState(WORKFLOWS[0]!.id)
  const [text, setText] = useState('')
  const folder = useNexora((s) => s.pickedFolder)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const workflow: WorkflowTemplate = WORKFLOWS.find((w) => w.id === workflowId)!
  const live = workflow.live
  const workerReady = worker.state === 'connected'

  const reset = () => {
    setConsent(false)
    setError(null)
  }

  const draft = useNexora((s) => s.composer)
  const built = buildRequest(workflow, draft, folder)

  const startLive = async () => {
    if (!built.request) return
    setBusy(true)
    setError(null)
    try {
      await window.nexora.createTask(built.request)
      setConsent(false)
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  const canStartLive = !!live && workerReady && consent && !busy && !!built.request
  const canStartDemo = demoMode && !!workflow.demoScenarioId

  return (
    <form
      data-testid="task-composer"
      className="panel flex min-w-0 flex-col gap-3 p-4"
      aria-label="Neue Aufgabe"
      onSubmit={(e) => {
        e.preventDefault()
        if (demoMode) {
          if (canStartDemo && workflow.demoScenarioId) startDemoScenario(workflow.demoScenarioId)
        } else void startLive()
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="hud-label">Neue Aufgabe</h2>
        <label className="flex items-center gap-2 text-xs text-text-2">
          Vorlage
          <select
            value={workflowId}
            onChange={(e) => {
              setWorkflowId(e.target.value)
              reset()
            }}
            className="input py-1 text-xs"
          >
            {WORKFLOWS.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!demoMode && live ? (
        <LiveForm template={workflow} onError={setError} />
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={`z. B. „${workflow.description}“`}
          aria-label="Aufgabe in natürlicher Sprache"
          className="input min-h-16 flex-1 resize-none text-sm"
        />
      )}

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-2">
        <span>Benötigt:</span>
        {workflow.capabilities.map((c) => (
          <span key={c} className="rounded border border-line px-1.5 py-0.5">
            {c}
          </span>
        ))}
      </div>

      {!demoMode && live && (
        <label className="flex items-start gap-2 text-xs text-text">
          <input type="checkbox" aria-label="Erlaubnis für diese Aufgabe" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[var(--color-accent)]" />
          <span>
            Ich erlaube NEXORA für diese Aufgabe: {(built.request?.capabilities ?? live.capabilities).map((c) => CAPABILITY_LABEL[c]).join(', ')}. Jede
            verändernde Aktion wird vorher einzeln zur Freigabe angezeigt.
          </span>
        </label>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!demoMode && !live && (
          <p className="flex flex-1 items-start gap-1.5 text-xs text-text-2">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden />
            {workflow.liveVia ? `So geht's: ${workflow.liveVia}.` : `Echte Ausführung dieser Vorlage folgt ab ${workflow.livePhase}. Im Demo-Modus kannst du den Ablauf ansehen.`}
          </p>
        )}
        {!demoMode && live && !workerReady && (
          <p className="flex-1 text-xs text-warning">Worker ist nicht verbunden{worker.message ? `: ${worker.message}` : ''}.</p>
        )}
        {demoMode && !workflow.demoScenarioId && <p className="flex-1 text-xs text-text-2">Für diese Vorlage gibt es noch keine Demo.</p>}
        {demoMode && workflow.demoScenarioId && <p className="flex-1 text-xs text-warning">Startet einen simulierten DEMO-Lauf.</p>}
        {!demoMode && live && workerReady && <span className="flex-1 text-xs text-text-2">{built.missing ?? ''}</span>}

        {!demoMode && !live && (
          <button type="button" className="btn-secondary" onClick={enterDemo}>
            Demo-Modus öffnen
          </button>
        )}
        {!demoMode && live && (
          <button type="submit" className="btn-primary" disabled={!canStartLive}>
            <Play className="size-4" aria-hidden /> Aufgabe starten
          </button>
        )}
        {demoMode && (
          <button type="submit" className="btn-primary" disabled={!canStartDemo}>
            <Play className="size-4" aria-hidden /> Demo starten
          </button>
        )}
      </div>
    </form>
  )
}
