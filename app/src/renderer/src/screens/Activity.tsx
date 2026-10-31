import { useState } from 'react'
import { BookmarkPlus, CheckCircle2, Hourglass, Play, ShieldQuestion, Undo2, XCircle } from 'lucide-react'
import type { RunStatus } from '@shared/events'
import { useNexora } from '../state/store'
import { selectPendingApprovals, selectRuns } from '../state/selectors'
import { isTerminal } from '../state/runReducer'
import { canUndo, cleanError, respondApproval, stopRun, undoRun } from '../lib/actions'
import { RunStatusBadge } from '../components/common/StatusBadge'
import { ApprovalCard } from '../components/approvals/ApprovalCenter'
import { lazy, Suspense } from 'react'
// Diagramm-Bibliothek erst laden, wenn diese Seite geöffnet wird (kleinerer Start)
const CostChart = lazy(() => import('../components/kpi/CostChart').then((m) => ({ default: m.CostChart })))
import { DemoTag, EmptyState } from '../components/common/Panel'
import { formatDuration, formatTime, formatUsd, cx } from '../lib/format'
import { ScreenHeader } from './ScreenHeader'
import { StatCard, StatGrid } from '../components/common/Cyber'
import { RunDetail } from '../components/feed/RunDetail'

type Filter = 'all' | 'active' | RunStatus

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Alle' },
  { id: 'active', label: 'Aktiv' },
  { id: 'succeeded', label: 'Erfolgreich' },
  { id: 'failed', label: 'Fehlgeschlagen' },
  { id: 'cancelled', label: 'Abgebrochen' }
]

export function Activity() {
  const data = useNexora((s) => s.data)
  const [filter, setFilter] = useState<Filter>('all')
  const [error, setError] = useState<string | null>(null)
  const [savingRun, setSavingRun] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const [openRun, setOpenRun] = useState<string | null>(null)
  const act = (p: Promise<unknown>) => {
    setError(null)
    p.catch((e: unknown) => setError(cleanError(e)))
  }
  const pending = selectPendingApprovals(data)
  const all = selectRuns(data)
  const finished = all.filter((r) => isTerminal(r.status) && r.status !== 'cancelled')
  const okCount = all.filter((r) => r.status === 'succeeded').length
  const failCount = all.filter((r) => r.status === 'failed').length
  const runs = all
    .filter((r) => (filter === 'all' ? true : filter === 'active' ? !isTerminal(r.status) : r.status === filter))
    .reverse()

  return (
    <div className="h-full overflow-y-auto p-6">
      <ScreenHeader title="Aktivitäten" subtitle="Verlauf aller Vorgänge und offene Freigaben." />

      {pending.length > 0 && (
        <section className="mb-6" aria-label="Offene Freigaben">
          <h2 className="hud-label mb-2 text-warning">Offene Freigaben ({pending.length})</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {pending.map((a) => (
              <ApprovalCard key={a.id} approval={a} runTitle={data.runs[a.runId]?.title} onRespond={(d) => act(respondApproval(a, d))} />
            ))}
          </div>
        </section>
      )}

      {saved && (
        <p role="status" className="mb-4 text-sm text-success">
          {saved}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mb-6">
        <StatGrid>
          <StatCard label="Laufend" value={all.filter((r) => !isTerminal(r.status)).length} icon={Play} />
          <StatCard label="Erfolgreich" value={okCount} icon={CheckCircle2} tone="success" />
          <StatCard label="Fehlgeschlagen" value={failCount} icon={XCircle} tone={failCount ? 'danger' : 'default'} />
          <StatCard label="Erfolgsquote" value={finished.length ? `${Math.round((okCount / finished.length) * 100)} %` : '–'} icon={Hourglass} />
          <StatCard label="Offene Freigaben" value={pending.length} icon={ShieldQuestion} tone={pending.length ? 'warning' : 'default'} />
        </StatGrid>
      </div>

      <div className="mb-6">
        <Suspense fallback={<div className="panel h-60" aria-busy="true" />}>
          <CostChart />
        </Suspense>
      </div>

      <div className="mb-3 flex gap-1" role="group" aria-label="Filter">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cx('rounded px-3 py-1 text-xs', filter === f.id ? 'bg-accent/20 text-accent-hi' : 'text-text-2 hover:bg-panel')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {runs.length === 0 ? (
        <EmptyState>Keine Vorgänge für diesen Filter.</EmptyState>
      ) : (
        <div className="panel overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs text-text-2">
              <tr>
                <th className="px-4 py-2 font-medium">Vorgang</th>
                <th className="px-4 py-2 font-medium">Agent</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Schritte</th>
                <th className="px-4 py-2 font-medium">Start</th>
                <th className="px-4 py-2 font-medium">Dauer</th>
                <th className="px-4 py-2 font-medium">Kosten</th>
                <th className="px-4 py-2 font-medium">Ergebnis / Prüfung</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {runs.map((r) => (
                <tr key={r.runId}>
                  <td className="px-4 py-2 text-text">
                    <button type="button" className="mr-2 text-left hover:text-accent-hi" onClick={() => setOpenRun(r.runId)} title="Details anzeigen">
                      {r.title}
                    </button>
                    {r.source === 'demo' && <DemoTag />}
                  </td>
                  <td className="px-4 py-2 text-text-2">{r.agentName ?? r.agentId ?? '–'}</td>
                  <td className="px-4 py-2"><RunStatusBadge status={r.status} /></td>
                  <td className="px-4 py-2 font-mono text-xs text-text-2">{r.stepsTotal !== undefined ? `${r.stepsDone}/${r.stepsTotal}` : '–'}</td>
                  <td className="px-4 py-2 font-mono text-xs text-text-2">{formatTime(r.createdAt)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-text-2">{r.endedAt ? formatDuration(Date.parse(r.endedAt) - Date.parse(r.createdAt)) : 'läuft'}</td>
                  <td className="px-4 py-2 font-mono text-xs text-text-2">{formatUsd(r.costUsd)}</td>
                  <td className="max-w-80 truncate px-4 py-2 text-xs text-text-2" title={r.verification ?? r.error}>{r.verification ?? r.error ?? '–'}</td>
                  <td className="px-4 py-2 text-right">
                    {!isTerminal(r.status) && (
                      <button type="button" className="btn-ghost text-xs" onClick={() => act(stopRun(r))}>Stoppen</button>
                    )}
                    {r.source === 'live' && r.status === 'succeeded' && r.workflow && r.workflow !== 'undo_organize' && savingRun !== r.runId && (
                      <button type="button" className="btn-ghost text-xs" onClick={() => { setSavingRun(r.runId); setTemplateName(r.title); setSaved(null) }}>
                        <BookmarkPlus className="size-3.5" aria-hidden /> Als Vorlage
                      </button>
                    )}
                    {savingRun === r.runId && (
                      <form
                        className="flex items-center gap-1"
                        onSubmit={(e) => {
                          e.preventDefault()
                          act(
                            window.nexora.createTemplate(r.runId, templateName).then((t) => {
                              setSaved(`Vorlage „${t.name}“ (Version ${t.version}) gespeichert – unter Automationen`)
                              setSavingRun(null)
                            })
                          )
                        }}
                      >
                        <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} aria-label="Name der Vorlage" className="input w-48 py-1 text-xs" maxLength={80} autoFocus />
                        <button type="submit" className="btn-primary text-xs" disabled={!templateName.trim()}>Speichern</button>
                        <button type="button" className="btn-ghost text-xs" onClick={() => setSavingRun(null)}>Abbrechen</button>
                      </form>
                    )}
                    {canUndo(data, r) && (
                      <button type="button" className="btn-ghost text-xs" onClick={() => act(undoRun(r))}>
                        <Undo2 className="size-3.5" aria-hidden /> Rückgängig
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openRun && data.runs[openRun] && <RunDetail run={data.runs[openRun]!} onClose={() => setOpenRun(null)} />}
    </div>
  )
}
