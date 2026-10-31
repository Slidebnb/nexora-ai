/*
 * Aufzeichnen per Auswahl (Recorder aus ClawBridge, sicher umgesetzt): Fenster wählen, Elemente aus der
 * Bedienungshilfen-Liste anklicken → Schritte. Keine globale Tastatur-/Maus-Aufzeichnung.
 */
import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, MousePointerClick, RefreshCw, TextCursorInput, X } from 'lucide-react'
import type { DesktopElement, DesktopStep, DesktopWindow } from '@shared/ipc-contract'
import { useNexora } from '../../state/store'
import { cleanError } from '../../lib/actions'

const TYPEABLE = new Set(['Edit', 'Document', 'ComboBox'])

function toRef(e: DesktopElement): DesktopStep['element'] {
  const { control_type, name, automation_id, parent_name, left, top, right, bottom } = e
  return { control_type, name, automation_id, parent_name, left, top, right, bottom }
}

function stepLabel(st: DesktopStep, labels: Map<string, string>): string {
  const key = `${st.element.control_type}|${st.element.name}|${st.element.automation_id}`
  const label = labels.get(key) ?? `${st.element.control_type} „${st.element.name || st.element.automation_id}“`
  return st.action === 'click' ? `${label} auslösen` : `Text in ${label} eintragen`
}

export function DesktopRecorder() {
  const d = useNexora((s) => s.composer)
  const set = useNexora((s) => s.setComposer)
  const [windows, setWindows] = useState<DesktopWindow[]>([])
  const [elements, setElements] = useState<DesktopElement[]>([])
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadWindows = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setWindows(await window.nexora.desktopWindows())
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const loadElements = useCallback(async (title: string) => {
    if (!title) {
      setElements([])
      return
    }
    setBusy(true)
    setError(null)
    try {
      setElements(await window.nexora.desktopElements(title))
    } catch (e) {
      setElements([])
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void loadWindows()
  }, [loadWindows])
  useEffect(() => {
    void loadElements(d.desktopWindow)
  }, [d.desktopWindow, loadElements])

  const labels = new Map(elements.map((e) => [`${e.control_type}|${e.name}|${e.automation_id}`, e.label]))
  const q = filter.trim().toLowerCase()
  const usable = elements.filter((e) => (e.name || e.automation_id) && !e.is_password && (!q || e.label.toLowerCase().includes(q)))
  const steps = d.desktopSteps
  const setSteps = (next: DesktopStep[]) => set({ desktopSteps: next.slice(0, 30) })
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= steps.length) return
    const next = [...steps]
    const tmp = next[i]!
    next[i] = next[j]!
    next[j] = tmp
    setSteps(next)
  }

  return (
    <div className="flex min-h-16 flex-1 flex-col gap-3" data-testid="desktop-recorder">
      <div className="flex items-center gap-2">
        <select
          className="input min-w-0 flex-1 text-sm"
          aria-label="Programmfenster"
          value={d.desktopWindow}
          onChange={(e) => set({ desktopWindow: e.target.value, desktopSteps: [] })}
        >
          <option value="">Programmfenster wählen …</option>
          {d.desktopWindow && !windows.some((w) => w.title === d.desktopWindow) && <option value={d.desktopWindow}>{d.desktopWindow}</option>}
          {windows.map((w) => (
            <option key={`${w.pid}-${w.title}`} value={w.title}>
              {w.title}
            </option>
          ))}
        </select>
        <button type="button" className="btn-ghost" onClick={() => void loadWindows().then(() => loadElements(d.desktopWindow))} disabled={busy} aria-label="Fenster neu laden">
          <RefreshCw className={`size-4 ${busy ? 'motion-safe:animate-spin' : ''}`} aria-hidden />
        </button>
      </div>
      {d.desktopWindow && (
        <div className="flex gap-1" role="radiogroup" aria-label="Art der Bedienung">
          {(
            [
              ['steps', 'Schritte zeigen (lokal)'],
              ['ai', 'KI machen lassen (Cloud)']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={d.desktopMode === id}
              onClick={() => set({ desktopMode: id })}
              className={`rounded px-3 py-1 text-xs ${d.desktopMode === id ? 'bg-accent/20 text-accent-hi' : 'text-text-2 hover:bg-panel'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-warning">
          {error}
        </p>
      )}

      {d.desktopWindow && d.desktopMode === 'ai' && (
        <div className="flex flex-col gap-1.5">
          <textarea
            value={d.desktopGoal}
            onChange={(e) => set({ desktopGoal: e.target.value })}
            rows={2}
            maxLength={1000}
            placeholder="Was soll die KI in diesem Fenster erledigen? z. B. „Trage im Formular die Kundennummer K-1042 ein“"
            aria-label="Ziel für die KI"
            className="input resize-none text-sm"
          />
          <p className="text-xs text-text-2">
            Die KI sieht nur Fotos dieses Fensters (sie gehen an deinen KI-Anbieter, es fallen API-Kosten an). Jeden Klick und jede Eingabe zeigt
            NEXORA dir vorher zur Freigabe. Am Ende gibt es ein Abschlussbild zum Prüfen.
          </p>
        </div>
      )}

      {d.desktopWindow && d.desktopMode === 'steps' && elements.length > 0 && (
        <div className="rounded border border-line">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Element suchen …" aria-label="Element suchen" className="input w-full rounded-b-none border-0 border-b text-xs" />
          <ul className="max-h-40 overflow-y-auto text-xs" aria-label="Elemente im Fenster">
            {usable.slice(0, 120).map((e, i) => (
              <li key={`${i}-${e.label}`} className="flex items-center gap-2 px-2 py-1 hover:bg-panel-2">
                <span className="min-w-0 flex-1 truncate" title={e.parent_name ? `in „${e.parent_name}“` : undefined}>
                  {e.label}
                </span>
                <button type="button" className="btn-ghost px-1.5 py-0.5 text-[11px]" onClick={() => setSteps([...steps, { action: 'click', element: toRef(e), text: '' }])}>
                  <MousePointerClick className="size-3.5" aria-hidden /> Klicken
                </button>
                {TYPEABLE.has(e.control_type) && (
                  <button type="button" className="btn-ghost px-1.5 py-0.5 text-[11px]" onClick={() => setSteps([...steps, { action: 'type', element: toRef(e), text: '' }])}>
                    <TextCursorInput className="size-3.5" aria-hidden /> Text eintragen
                  </button>
                )}
              </li>
            ))}
            {usable.length === 0 && <li className="px-2 py-2 text-text-2">Keine passenden Elemente.</li>}
          </ul>
        </div>
      )}

      {d.desktopMode === 'steps' && (
      <ol className="space-y-1.5" aria-label="Aufgezeichnete Schritte">
        {steps.map((st, i) => (
          <li key={i} className="rounded border border-line px-2 py-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono text-text-2">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate text-text">{stepLabel(st, labels)}</span>
              <button type="button" className="btn-ghost p-1" onClick={() => move(i, -1)} aria-label={`Schritt ${i + 1} nach oben`}>
                <ArrowUp className="size-3.5" aria-hidden />
              </button>
              <button type="button" className="btn-ghost p-1" onClick={() => move(i, 1)} aria-label={`Schritt ${i + 1} nach unten`}>
                <ArrowDown className="size-3.5" aria-hidden />
              </button>
              <button type="button" className="btn-ghost p-1 hover:text-danger" onClick={() => setSteps(steps.filter((_, j) => j !== i))} aria-label={`Schritt ${i + 1} entfernen`}>
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
            {st.action === 'type' && (
              <textarea
                value={st.text}
                onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                rows={1}
                maxLength={5000}
                placeholder="Text, den NEXORA eintragen soll"
                aria-label={`Text für Schritt ${i + 1}`}
                className="input mt-1 w-full resize-y text-xs"
              />
            )}
          </li>
        ))}
      </ol>
      )}
      {d.desktopWindow && d.desktopMode === 'steps' && steps.length === 0 && <p className="text-xs text-text-2">Klicke oben bei einem Element auf „Klicken“ oder „Text eintragen“, um Schritte aufzuzeichnen.</p>}
    </div>
  )
}
