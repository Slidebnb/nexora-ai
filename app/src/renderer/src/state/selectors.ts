import type { NexoraEvent } from '@shared/events'
import { isTerminal, type ApprovalState, type NexoraState, type RunState } from './runReducer'

export type AgentVisualState = 'idle' | 'planning' | 'executing' | 'waiting' | 'done' | 'failed'

export const AGENT_STATE_LABEL: Record<AgentVisualState, string> = {
  idle: 'Bereit',
  planning: 'Plant',
  executing: 'Führt aus',
  waiting: 'Wartet auf Freigabe',
  done: 'Erledigt',
  failed: 'Fehlgeschlagen'
}

export interface AgentView {
  agentId: string
  name: string
  state: AgentVisualState
  run?: RunState
}

export function agentStateOf(run: RunState | undefined): AgentVisualState {
  if (!run) return 'idle'
  switch (run.status) {
    case 'queued':
      return 'planning'
    case 'running':
      return run.planReady ? 'executing' : 'planning'
    case 'waiting_approval':
      return 'waiting'
    case 'succeeded':
      return 'done'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'idle'
  }
}

/** Ein Agent je agentId; maßgeblich ist sein zuletzt erstellter Run. */
export function selectAgents(state: NexoraState): AgentView[] {
  const latest = new Map<string, RunState>()
  for (const runId of state.runOrder) {
    const run = state.runs[runId]
    if (run?.agentId) latest.set(run.agentId, run)
  }
  return [...latest.entries()].map(([agentId, run]) => ({
    agentId,
    name: run.agentName ?? agentId,
    state: agentStateOf(run),
    run
  }))
}

export function selectRuns(state: NexoraState): RunState[] {
  return state.runOrder.map((id) => state.runs[id]).filter((r): r is RunState => !!r)
}

export function selectActiveRuns(state: NexoraState): RunState[] {
  return selectRuns(state).filter((r) => !isTerminal(r.status))
}

export function selectPendingApprovals(state: NexoraState): ApprovalState[] {
  return Object.values(state.approvals).filter((a) => {
    const run = state.runs[a.runId]
    return !a.decision && !!run && !isTerminal(run.status)
  })
}

export interface Kpis {
  total: number
  active: number
  succeeded: number
  failed: number
  pendingApprovals: number
  costUsd: number
}

export function selectKpis(state: NexoraState): Kpis {
  const runs = selectRuns(state)
  return {
    total: runs.length,
    active: runs.filter((r) => !isTerminal(r.status)).length,
    succeeded: runs.filter((r) => r.status === 'succeeded').length,
    failed: runs.filter((r) => r.status === 'failed').length,
    pendingApprovals: selectPendingApprovals(state).length,
    costUsd: runs.reduce((sum, r) => sum + r.costUsd, 0)
  }
}

/** Kumulierte Kosten aller Runs über die Zeit, nur aus cost_updated-Events. */
export function selectCostSeries(state: NexoraState): { t: number; usd: number }[] {
  const perRun = new Map<string, number>()
  const series: { t: number; usd: number }[] = []
  for (const e of state.log as NexoraEvent[]) {
    if (e.type !== 'cost_updated' || !state.runs[e.runId]) continue
    const usd = typeof e.payload['totalUsd'] === 'number' ? e.payload['totalUsd'] : undefined
    if (usd === undefined) continue
    perRun.set(e.runId, usd)
    series.push({ t: Date.parse(e.timestamp), usd: [...perRun.values()].reduce((a, b) => a + b, 0) })
  }
  return series
}
