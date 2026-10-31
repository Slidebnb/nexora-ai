import { useNexora } from '../state/store'
import { selectActiveRuns, selectAgents, selectKpis } from '../state/selectors'
import { progressOf } from '../state/runReducer'
import { OrbitCore } from '../components/hud/OrbitCore'
import { MatrixRain } from '../components/hud/MatrixRain'
import { ScanLines } from '../components/hud/ScanLines'
import { DataFlowLines, type PulseTone } from '../components/hud/DataFlowLines'
import { HexStream } from '../components/hud/HexStream'
import { WireframeGlobe } from '../components/hud/WireframeGlobe'
import { RadarSweep } from '../components/hud/RadarSweep'
import { NeuralNetwork } from '../components/hud/NeuralNetwork'
import { GlitchOverlay } from '../components/hud/GlitchOverlay'
import type { NexoraEvent } from '@shared/events'
import { formatUsd } from '../lib/format'
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
  const active = selectActiveRuns(data)
  const focus = active[0]
  const kpis = selectKpis(data)
  const lastEvent = data.log[data.log.length - 1]
  const intensity = Math.min(1, active.length * 0.5)

  return (
    <div className="relative grid h-full min-h-[760px] grid-rows-[auto_minmax(0,1fr)_220px] gap-3 p-4">
      <NeuralNetwork opacity={0.1} />
      <GlitchOverlay />
      <KpiGrid />
      <div className={cx('grid min-h-0 gap-3', rightOpen ? 'grid-cols-[minmax(0,1fr)_340px]' : 'grid-cols-1')}>
        <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] gap-3 xl:grid-cols-[minmax(0,1fr)_340px] xl:grid-rows-1">
          <div data-testid="orbit-panel" className="panel hud-grid relative min-h-[200px] overflow-hidden p-3">
            <WireframeGlobe opacity={0.22} />
            <MatrixRain intensity={intensity} opacity={0.18 + intensity * 0.17} />
            <DataFlowLines pulseKey={lastEvent?.seq ?? 0} tone={toneOf(lastEvent)} />
            <OrbitCore
              agents={agents}
              progress={focus ? progressOf(focus) : undefined}
              readouts={{
                active: kpis.active,
                pendingApprovals: kpis.pendingApprovals,
                steps: focus?.stepsTotal !== undefined ? `SCHRITT ${focus.stepsDone}/${focus.stepsTotal}` : focus ? 'SCHRITT ?' : 'SCHRITT –',
                cost: formatUsd(kpis.costUsd)
              }}
            />
            <div className="absolute right-2 top-2 w-60 max-xl:hidden">
              <HexStream events={data.log} lines={5} />
            </div>
            <div className="pointer-events-none absolute bottom-2 left-2 size-28 opacity-60 max-xl:hidden">
              <RadarSweep />
            </div>
            <ScanLines />
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

function toneOf(e: NexoraEvent | undefined): PulseTone {
  if (!e) return 'accent'
  if (e.type === 'step_failed' || e.type === 'run_failed') return 'danger'
  if (e.type === 'approval_requested') return 'warning'
  if (e.type === 'run_succeeded') return 'success'
  return 'accent'
}
