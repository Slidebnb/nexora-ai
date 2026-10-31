import { CheckCircle2, Hourglass, PlayCircle, XCircle, Coins } from 'lucide-react'
import { useNexora } from '../../state/store'
import { selectKpis } from '../../state/selectors'
import { formatUsd } from '../../lib/format'

export function KpiGrid() {
  const k = selectKpis(useNexora((s) => s.data))
  const demo = useNexora((s) => s.demoMode)
  const items = [
    { label: 'Aktiv', value: String(k.active), icon: PlayCircle, tone: 'text-accent-hi' },
    { label: 'Erfolgreich', value: String(k.succeeded), icon: CheckCircle2, tone: 'text-success' },
    { label: 'Fehlgeschlagen', value: String(k.failed), icon: XCircle, tone: 'text-danger' },
    { label: 'Freigaben offen', value: String(k.pendingApprovals), icon: Hourglass, tone: 'text-warning' },
    { label: demo ? 'Kosten (simuliert)' : 'Kosten', value: formatUsd(k.costUsd), icon: Coins, tone: 'text-text' }
  ]
  return (
    <dl className="grid grid-cols-5 gap-3">
      {items.map(({ label, value, icon: Icon, tone }) => (
        <div key={label} className="panel flex items-center gap-3 px-3 py-2.5">
          <Icon className={`size-5 ${tone}`} aria-hidden />
          <div className="min-w-0">
            <dt className="hud-label truncate" title={label}>{label}</dt>
            <dd className="font-mono text-lg tabular-nums text-text">{value}</dd>
          </div>
        </div>
      ))}
    </dl>
  )
}
