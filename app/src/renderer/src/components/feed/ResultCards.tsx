import { FileText, Link2, Sheet, Download, FolderOpen } from 'lucide-react'
import type { ArtifactKind } from '@shared/events'
import { useNexora } from '../../state/store'
import { formatTime } from '../../lib/format'
import { DemoTag, EmptyState, Panel } from '../common/Panel'

const ICON: Record<ArtifactKind, typeof FileText> = { table: Sheet, file: FileText, link: Link2, export: Download }
export const KIND: Record<ArtifactKind, string> = { table: 'Tabelle', file: 'Datei', link: 'Link', export: 'Export' }

export function ResultCards({ limit, query = '', kind }: { limit?: number; query?: string; kind?: ArtifactKind }) {
  const artifacts = useNexora((s) => s.data.artifacts)
  const runs = useNexora((s) => s.data.runs)
  const q = query.trim().toLowerCase()
  const list = [...artifacts]
    .reverse()
    .filter((a) => (!kind || a.kind === kind) && (!q || a.name.toLowerCase().includes(q) || (runs[a.runId]?.title ?? '').toLowerCase().includes(q)))
    .slice(0, limit)

  return (
    <Panel title="Ergebnisse" bodyClassName="overflow-y-auto p-3">
      {list.length === 0 ? (
        <EmptyState>{artifacts.length ? 'Kein Ergebnis passt zur Suche.' : 'Noch keine Ergebnisse.'}</EmptyState>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
          {list.map((a) => {
            const Icon = ICON[a.kind]
            const run = runs[a.runId]
            return (
              <li key={a.id} className="flex items-center gap-3 rounded-md border border-line bg-panel-2/60 px-3 py-2">
                <Icon className="size-5 text-accent-hi" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text">{a.name}</p>
                  <p className="truncate text-[11px] text-text-2">
                    {KIND[a.kind]} · {run?.title ?? a.runId} · {formatTime(a.createdAt)}
                  </p>
                </div>
                {run?.source === 'demo' ? (
                  <DemoTag />
                ) : a.uri?.startsWith('file:') ? (
                  <button type="button" className="btn-ghost text-xs" onClick={() => void window.nexora.revealArtifact(a.id)} title="Im Explorer anzeigen">
                    <FolderOpen className="size-3.5" aria-hidden /> Anzeigen
                  </button>
                ) : a.uri ? (
                  <span className="max-w-40 truncate font-mono text-[11px] text-text-2" title={a.uri}>{a.uri}</span>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
