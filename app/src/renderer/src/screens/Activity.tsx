import { useState } from 'react'
import type { RunStatus } from '@shared/events'
import { useNexora } from '../state/store'
import { selectPendingApprovals, selectRuns } from '../state/selectors'
import { isTerminal } from '../state/runReducer'
import { respondDemoApproval, stopDemoRun } from '../demo/controller'
import { RunStatusBadge } from '../components/common/StatusBadge'
import { ApprovalCard } from '../components/approvals/ApprovalCenter'
import { CostChart } from '../components/kpi/CostChart'
import { DemoTag, EmptyState } from '../components/common/Panel'
import { formatDuration, formatTime, formatUsd, cx } from '../lib/format'
import { ScreenHeader } from './ScreenHeader'

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
  const pending = selectPendingApprovals(data)
  const runs = selectRuns(data)
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
              <ApprovalCard key={a.id} approval={a} runTitle={data.runs[a.runId]?.title} onRespond={(d) => a.source === 'demo' && respondDemoApproval(a.id, d)} />
            ))}
          </div>
        </section>
      )}

      <div className="mb-6">
        <CostChart />
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
                    <span className="mr-2">{r.title}</span>
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
                    {!isTerminal(r.status) && r.source === 'demo' && (
                      <button type="button" className="btn-ghost text-xs" onClick={() => stopDemoRun(r.runId)}>Stoppen</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
