import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useNexora } from '../../state/store'
import { selectCostSeries } from '../../state/selectors'
import { formatTime, formatUsd } from '../../lib/format'
import { EmptyState, Panel } from '../common/Panel'

export function CostChart() {
  const data = useNexora((s) => s.data)
  const series = selectCostSeries(data)
  const demo = useNexora((s) => s.demoMode)

  return (
    <Panel title={demo ? 'API-Kosten (simuliert)' : 'API-Kosten'} className="h-60" bodyClassName="p-2">
      {series.length === 0 ? (
        <EmptyState>Keine Kostendaten. Werte stammen ausschließlich aus cost_updated-Events.</EmptyState>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f43f67" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#f43f67" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t: number) => formatTime(new Date(t).toISOString())} stroke="#9ba5b8" fontSize={10} />
            <YAxis tickFormatter={(v: number) => `$${v.toFixed(2)}`} stroke="#9ba5b8" fontSize={10} width={44} />
            <Tooltip
              contentStyle={{ background: '#131b2c', border: '1px solid #26324a', fontSize: 12 }}
              labelFormatter={(t) => formatTime(new Date(Number(t)).toISOString())}
              formatter={(v) => [formatUsd(Number(v)), 'Summe']}
            />
            <Area type="stepAfter" dataKey="usd" stroke="#f43f67" fill="url(#costFill)" strokeWidth={2} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Panel>
  )
}
