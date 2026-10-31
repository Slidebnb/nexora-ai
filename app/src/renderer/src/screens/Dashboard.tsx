import { useNexora } from '../state/store'
import { selectActiveRuns, selectAgents } from '../state/selectors'
import { progressOf } from '../state/runReducer'
import { OrbitCore } from '../components/hud/OrbitCore'
import { KpiGrid } from '../components/kpi/KpiGrid'
import { TaskComposer } from '../components/task/TaskComposer'
import { AgentsPanel } from '../components/agents/AgentsPanel'
import { ActivityFeed } from '../components/feed/ActivityFeed'
import { EventLog } from '../components/feed/EventLog'
import { ResultCards } from '../components/feed/ResultCards'
import { cx } from '../lib/format'

export function Dashboard() {
  const data = useNexora((s) => s.data)
  const rightOpen = useNexora((s) => s.rightPanelOpen)
  const agents = selectAgents(data)
  const focus = selectActiveRuns(data)[0]

  return (
    <div className="relative grid h-full min-h-[760px] grid-rows-[auto_minmax(0,1fr)_220px] gap-3 p-4">
      <KpiGrid />
      <div className={cx('grid min-h-0 gap-3', rightOpen ? 'grid-cols-[minmax(0,1fr)_340px]' : 'grid-cols-1')}>
        <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] gap-3">
          <div data-testid="orbit-panel" className="panel hud-grid relative min-h-[200px] overflow-hidden p-3">
            <OrbitCore agents={agents} progress={focus ? progressOf(focus) : undefined} />
          </div>
          <TaskComposer />
        </div>
        {rightOpen && (
          <aside className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1.1fr)_minmax(0,1fr)] gap-3" aria-label="Agenten und Aktivität">
            <AgentsPanel />
            <ActivityFeed />
          </aside>
        )}
      </div>
      <div className="grid min-h-0 grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
        <EventLog />
        <ResultCards limit={6} />
      </div>
    </div>
  )
}
