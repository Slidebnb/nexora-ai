import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, FolderOpen, Play, Trash2 } from 'lucide-react'
import type { Schedule, Template } from '@shared/ipc-contract'
import { useNexora } from '../../state/store'
import { cleanError } from '../../lib/actions'
import { formatTime } from '../../lib/format'
import { EmptyState } from '../common/Panel'

const WORKFLOW_LABEL: Record<string, string> = {
  organize_folder: 'Ordner-Organisator',
  web_research: 'Web-Recherche',
  pdf_analysis: 'PDF-Analyse',
  draft_emails: 'Entwurf statt Versand'
}

function describeSchedule(s: Schedule | null): string {
  if (!s) return 'kein Zeitplan'
  return s.type === 'daily' ? `täglich um ${s.time} (bei geöffneter App)` : `alle ${s.minutes} Minuten (bei geöffneter App)`
}

function TemplateCard({ t, onChanged, onError }: { t: Template; onChanged: () => void; onError: (m: string) => void }) {
  const setScreen = useNexora((s) => s.setScreen)
  const [mode, setMode] = useState<'off' | 'daily' | 'interval'>(t.schedule?.type ?? 'off')
  const [time, setTime] = useState(t.schedule?.type === 'daily' ? t.schedule.time : '08:00')
  const [minutes, setMinutes] = useState(t.schedule?.type === 'interval' ? t.schedule.minutes : 60)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true)
    try {
      await fn()
      onChanged()
      after?.()
    } catch (e) {
      onError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  const runWithNewInput = async () => {
    if (t.workflow === 'organize_folder') {
      const f = await window.nexora.pickFolder()
      if (f) await window.nexora.runTemplate({ templateId: t.templateId, folderId: f.folderId })
      return Boolean(f)
    }
    if (t.workflow === 'pdf_analysis') {
      const files = await window.nexora.pickFiles('pdf')
      if (files.length) await window.nexora.runTemplate({ templateId: t.templateId, fileIds: files.map((f) => f.fileId) })
      return files.length > 0
    }
    if (t.workflow === 'draft_emails') {
      const f = await window.nexora.pickFolder()
      if (f) await window.nexora.runTemplate({ templateId: t.templateId, outFolderId: f.folderId })
      return Boolean(f)
    }
    return false
  }
  const canOverride = ['organize_folder', 'pdf_analysis', 'draft_emails'].includes(t.workflow)

  return (
    <article className="panel flex flex-col gap-3 p-4" aria-label={`Vorlage ${t.name}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-text">{t.name}</h3>
          <p className="text-xs text-text-2">
            {WORKFLOW_LABEL[t.workflow] ?? t.workflow} · Version {t.version}
            {t.versions > 1 ? ` (${t.versions} Versionen)` : ''} · zuletzt {t.lastRunAt ? formatTime(t.lastRunAt) : 'nie'} ausgeführt
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void act(() => window.nexora.runTemplate({ templateId: t.templateId }), () => setScreen('dashboard'))}>
          <Play className="size-3.5" aria-hidden /> Ausführen
        </button>
        {canOverride && (
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => void act(runWithNewInput, () => setScreen('dashboard'))}
          >
            <FolderOpen className="size-3.5" aria-hidden /> Mit anderer Auswahl …
          </button>
        )}
        {confirmDelete ? (
          <button type="button" className="btn-ghost text-danger" disabled={busy} onClick={() => void act(() => window.nexora.deleteTemplate(t.templateId))}>
            <Trash2 className="size-3.5" aria-hidden /> Wirklich alle Versionen löschen
          </button>
        ) : (
          <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-3.5" aria-hidden /> Löschen
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs text-text-2">
        <CalendarClock className="size-4" aria-hidden />
        <label className="flex items-center gap-1.5">
          Zeitplan
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="input py-1 text-xs" aria-label={`Zeitplan ${t.name}`}>
            <option value="off">aus</option>
            <option value="daily">täglich</option>
            <option value="interval">Intervall</option>
          </select>
        </label>
        {mode === 'daily' && <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input py-1 text-xs" aria-label="Uhrzeit" />}
        {mode === 'interval' && (
          <label className="flex items-center gap-1">
            alle
            <input type="number" min={15} step={15} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="input w-20 py-1 text-xs" aria-label="Minuten" />
            Min.
          </label>
        )}
        <button
          type="button"
          className="btn-ghost text-xs"
          disabled={busy}
          onClick={() =>
            void act(() =>
              window.nexora.scheduleTemplate(t.templateId, mode === 'off' ? null : mode === 'daily' ? { type: 'daily', time } : { type: 'interval', minutes })
            )
          }
        >
          Übernehmen
        </button>
        <span className="ml-auto">{describeSchedule(t.schedule)}</span>
      </div>
    </article>
  )
}

export function TemplatesPanel() {
  const worker = useNexora((s) => s.worker.state)
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (worker !== 'connected') return
    window.nexora.listTemplates().then(
      (t) => {
        setTemplates(t)
        setError(null)
      },
      (e: unknown) => setError(cleanError(e))
    )
  }, [worker])

  useEffect(load, [load])

  return (
    <section className="mb-8" aria-labelledby="tpl-title">
      <h2 id="tpl-title" className="hud-label mb-1">
        Meine Vorlagen
      </h2>
      <p className="mb-3 text-xs text-text-2">
        Aus erfolgreichen Vorgängen gespeichert (unter Aktivitäten → „Als Vorlage“). Beim Ausführen werden alle Freigaben erneut abgefragt.
      </p>
      {error && <p role="alert" className="mb-2 text-sm text-danger">{error}</p>}
      {worker !== 'connected' ? (
        <EmptyState>Vorlagen sind verfügbar, sobald der Worker verbunden ist.</EmptyState>
      ) : templates === null ? null : templates.length === 0 ? (
        <EmptyState>Noch keine Vorlagen.</EmptyState>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-4">
          {templates.map((t) => (
            <TemplateCard key={t.templateId} t={t} onChanged={load} onError={setError} />
          ))}
        </div>
      )}
    </section>
  )
}
