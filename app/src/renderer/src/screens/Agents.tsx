import { useState } from 'react'
import { Bot, CheckCircle2, Clock, Play, XCircle } from 'lucide-react'
import { useNexora } from '../state/store'
import { AGENT_STATE_LABEL, selectAgents, selectAgentStats, type AgentView, type AgentVisualState } from '../state/selectors'
import { AgentCard } from '../components/agents/AgentCard'
import { EmptyState } from '../components/common/Panel'
import { DetailModal, SearchBox, StatCard, StatGrid } from '../components/common/Cyber'
import { cx, formatTime } from '../lib/format'
import { ScreenHeader } from './ScreenHeader'

const DOT: Record<AgentVisualState, string> = {
  idle: 'bg-text-2',
  planning: 'bg-accent-hi',
  executing: 'bg-accent',
  waiting: 'bg-warning',
  done: 'bg-success',
  failed: 'bg-danger'
}

/** Agenten-Übersicht im Aufbau des cyberpunk-dashboard „Agent Network“ – mit echten Zählwerten. */
export function Agents() {
  const data = useNexora((s) => s.data)
  const agents = selectAgents(data)
  const stats = selectAgentStats(data)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<AgentView | null>(null)
  const q = query.trim().toLowerCase()
  const list = agents.filter((a) => !q || a.name.toLowerCase().includes(q) || a.agentId.toLowerCase().includes(q))
  const active = agents.filter((a) => a.state === 'planning' || a.state === 'executing' || a.state === 'waiting').length
  const totals = Object.values(stats).reduce((t, s) => ({ succeeded: t.succeeded + s.succeeded, failed: t.failed + s.failed }), { succeeded: 0, failed: 0 })
  const current = selected ? (agents.find((a) => a.agentId === selected.agentId) ?? selected) : null

  return (
    <div className="h-full space-y-5 overflow-y-auto p-6">
      <ScreenHeader title="Agenten" subtitle="Wer arbeitet gerade woran – mit allen bisherigen Vorgängen." />

      <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_3fr]">
        <SearchBox value={query} onChange={setQuery} placeholder="Agent suchen …" label="Agent suchen" />
        <StatGrid>
          <StatCard label="Agenten" value={agents.length} icon={Bot} />
          <StatCard label="Gerade aktiv" value={active} icon={Play} tone={active ? 'warning' : 'default'} />
          <StatCard label="Erledigt" value={totals.succeeded} icon={CheckCircle2} tone="success" />
          <StatCard label="Fehlgeschlagen" value={totals.failed} icon={XCircle} tone={totals.failed ? 'danger' : 'default'} />
        </StatGrid>
      </div>

      {agents.length === 0 ? (
        <EmptyState>Noch keine Agenten. Agenten entstehen mit dem ersten Vorgang.</EmptyState>
      ) : (
        <section className="panel overflow-x-auto" aria-label="Agentenliste">
          <h2 className="hud-label border-b border-line px-4 py-2.5">Agentenliste</h2>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs text-text-2">
              <tr>
                <th className="px-4 py-2 font-medium">Agent</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Aktueller / letzter Vorgang</th>
                <th className="px-4 py-2 font-medium">Zuletzt aktiv</th>
                <th className="px-4 py-2 font-medium">Vorgänge</th>
                <th className="px-4 py-2 font-medium">Erledigt</th>
                <th className="px-4 py-2 font-medium">Fehler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((a) => {
                const s = stats[a.agentId]
                return (
                  <tr key={a.agentId} className="cursor-pointer hover:bg-panel-2" onClick={() => setSelected(a)}>
                    <td className="px-4 py-2.5">
                      <button type="button" className="text-left font-medium text-text hover:text-accent-hi" onClick={(e) => { e.stopPropagation(); setSelected(a) }}>
                        {a.name}
                      </button>
                      <span className="block font-mono text-[11px] text-text-2">{a.agentId}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 text-xs text-text">
                        <span className={cx('size-2 rounded-full', DOT[a.state])} aria-hidden />
                        {AGENT_STATE_LABEL[a.state]}
                      </span>
                    </td>
                    <td className="max-w-72 truncate px-4 py-2.5 text-text-2" title={a.run?.title}>{a.run?.title ?? '–'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-text-2">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="size-3" aria-hidden /> {s?.lastActive ? formatTime(s.lastActive) : '–'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-text">{s?.runs ?? 0}</td>
                    <td className="px-4 py-2.5 font-mono text-success">{s?.succeeded ?? 0}</td>
                    <td className={cx('px-4 py-2.5 font-mono', s?.failed ? 'text-danger' : 'text-text-2')}>{s?.failed ?? 0}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {list.length === 0 && <EmptyState>Kein Agent passt zur Suche.</EmptyState>}
        </section>
      )}

      {current && (
        <DetailModal title={current.name} subtitle={current.agentId} onClose={() => setSelected(null)}>
          <AgentCard agent={current} detailed />
        </DetailModal>
      )}
    </div>
  )
}
