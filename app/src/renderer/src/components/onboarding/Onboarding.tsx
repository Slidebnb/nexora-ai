import { useState } from 'react'
import { FolderSync, Hand, HardDrive, MessageSquareText, ShieldCheck, Undo2 } from 'lucide-react'
import { useNexora } from '../../state/store'
import { cleanError } from '../../lib/actions'

/** Begrüßung beim ersten Start: in drei Schritten zum ersten echten Erfolg. */
export function Onboarding() {
  const settings = useNexora((s) => s.settings)
  const saveSettings = useNexora((s) => s.saveSettings)
  const setPickedFolder = useNexora((s) => s.setPickedFolder)
  const setScreen = useNexora((s) => s.setScreen)
  const openWizard = useNexora((s) => s.setWizard)
  const worker = useNexora((s) => s.worker.state)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!settings || settings.onboarded) return null

  const finish = () => void saveSettings({ onboarded: true })
  const startPractice = async () => {
    setBusy(true)
    setError(null)
    try {
      const folder = await window.nexora.createPracticeFolder()
      setPickedFolder(folder)
      await saveSettings({ onboarded: true })
      setScreen('dashboard')
      openWizard('ordner')
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  const steps = [
    {
      title: 'Willkommen bei NEXORA',
      body: (
        <ul className="space-y-4">
          <li className="flex gap-3">
            <MessageSquareText className="mt-0.5 size-5 shrink-0 text-accent-hi" aria-hidden />
            <span>Du wählst, was erledigt werden soll – zum Beispiel einen Ordner aufräumen oder PDFs zusammenfassen.</span>
          </li>
          <li className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent-hi" aria-hidden />
            <span>Bevor NEXORA etwas verändert, zeigt es dir genau, was passiert, und wartet auf dein OK.</span>
          </li>
          <li className="flex gap-3">
            <HardDrive className="mt-0.5 size-5 shrink-0 text-accent-hi" aria-hidden />
            <span>Deine Dateien bleiben auf deinem PC. Nur wenn du es ausdrücklich erlaubst, wird KI aus dem Internet genutzt.</span>
          </li>
        </ul>
      )
    },
    {
      title: 'Du behältst die Kontrolle',
      body: (
        <div className="space-y-4">
          <div className="rounded-md border border-warning/50 bg-panel-2 p-4 text-sm" aria-label="Beispiel einer Bestätigung">
            <p className="hud-label mb-2 text-warning">Beispiel</p>
            <p className="font-semibold text-text">Dateien verschieben</p>
            <p className="mt-1 text-text-2">Was passiert: Dateien werden in Unterordner sortiert. Nichts wird gelöscht.</p>
            <div className="mt-3 flex justify-end gap-2" aria-hidden>
              <span className="rounded border border-accent px-3 py-1 text-xs text-accent-hi">Ablehnen</span>
              <span className="rounded bg-accent px-3 py-1 text-xs text-white">Erlauben</span>
            </div>
          </div>
          <p className="flex gap-3 text-text-2">
            <Hand className="size-5 shrink-0 text-accent-hi" aria-hidden /> Du kannst jede Aufgabe jederzeit stoppen.
          </p>
          <p className="flex gap-3 text-text-2">
            <Undo2 className="size-5 shrink-0 text-accent-hi" aria-hidden /> Aufgeräumte Ordner lassen sich mit einem Klick zurücksetzen.
          </p>
        </div>
      )
    },
    {
      title: 'Probier es gefahrlos aus',
      body: (
        <div className="space-y-3 text-text-2">
          <p>
            NEXORA legt in deinem Ordner <span className="text-text">Dokumente</span> einen <span className="text-text">Übungsordner</span> mit
            Beispieldateien an. Danach räumst du ihn mit NEXORA auf – du bestätigst vorher und kannst alles rückgängig machen.
          </p>
          <p className="text-xs">Die Beispieldateien enthalten nur einen kurzen Hinweistext und können danach gelöscht werden.</p>
        </div>
      )
    }
  ]
  const current = steps[step]!

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-base/80 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="onb-title" className="panel w-[560px] max-w-[94vw] p-7">
        <div className="mb-5 flex items-center gap-2" aria-label={`Schritt ${step + 1} von ${steps.length}`}>
          {steps.map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-panel-2'}`} />
          ))}
        </div>
        <h2 id="onb-title" className="mb-5 text-2xl font-semibold text-text">
          {current.title}
        </h2>
        <div className="min-h-44 text-sm text-text">{current.body}</div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-6 flex items-center justify-between">
          <button type="button" className="btn-ghost" onClick={finish}>
            {step < steps.length - 1 ? 'Überspringen' : 'Später'}
          </button>
          {step < steps.length - 1 ? (
            <button type="button" className="btn-primary" onClick={() => setStep(step + 1)}>
              Weiter
            </button>
          ) : (
            <button type="button" className="btn-primary" disabled={busy || worker !== 'connected'} onClick={() => void startPractice()}>
              <FolderSync className="size-4" aria-hidden /> {worker === 'connected' ? 'Übungsordner anlegen und loslegen' : 'NEXORA startet noch …'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
