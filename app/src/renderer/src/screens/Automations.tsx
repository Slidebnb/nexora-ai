import { Play } from 'lucide-react'
import { WORKFLOWS } from '../data/workflows'
import { useNexora } from '../state/store'
import { startDemoScenario } from '../demo/controller'
import { ScreenHeader } from './ScreenHeader'
import { TemplatesPanel } from '../components/templates/TemplatesPanel'

export function Automations() {
  const demoMode = useNexora((s) => s.demoMode)
  const setScreen = useNexora((s) => s.setScreen)
  return (
    <div className="h-full overflow-y-auto p-6">
      <ScreenHeader title="Automationen" subtitle="Eigene Vorlagen für wiederkehrende Aufgaben und die mitgelieferten Workflow-Bausteine." />
      <TemplatesPanel />
      <h2 className="hud-label mb-3">Workflow-Bausteine</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {WORKFLOWS.map((w) => (
          <article key={w.id} className="panel flex flex-col p-4">
            <h2 className="font-semibold text-text">{w.title}</h2>
            <p className="mt-1 flex-1 text-sm text-text-2">{w.description}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-text-2">
              {w.capabilities.map((c) => (
                <li key={c} className="rounded border border-line px-1.5 py-0.5">
                  {c}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between text-xs">
              <span className="text-text-2">{w.live || w.liveVia ? 'Live verfügbar' : `Live: ab ${w.livePhase}`}</span>
              {w.demoScenarioId && demoMode ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    startDemoScenario(w.demoScenarioId!)
                    setScreen('dashboard')
                  }}
                >
                  <Play className="size-3.5" aria-hidden /> Demo starten
                </button>
              ) : (
                <span className="text-text-2">{w.demoScenarioId ? 'Demo im Demo-Modus' : 'Keine Demo'}</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
