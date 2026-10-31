import {
  PAYLOAD_SCHEMAS,
  type ApprovalDecision,
  type ArtifactKind,
  type EventSource,
  type NexoraEvent,
  type RunStatus
} from '@shared/events'

export type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export interface StepState {
  id: string
  title: string
  status: StepStatus
  summary?: string
  error?: string
}

export interface ApprovalState {
  id: string
  runId: string
  source: EventSource
  action: string
  target: string
  data: string
  impact: string
  requestedAt: string
  decision?: ApprovalDecision
  resolvedAt?: string
}

export interface ArtifactState {
  id: string
  runId: string
  kind: ArtifactKind
  name: string
  uri?: string
  createdAt: string
}

export interface RunState {
  runId: string
  taskId: string
  source: EventSource
  title: string
  agentId?: string
  agentName?: string
  status: RunStatus
  planReady: boolean
  steps: StepState[]
  /** Nur gesetzt, wenn plan_ready die Schrittzahl geliefert hat. */
  stepsTotal?: number
  stepsDone: number
  currentStepId?: string
  createdAt: string
  endedAt?: string
  costUsd: number
  error?: string
  verification?: string
  /** Events, die gegen den Vertrag verstoßen (z. B. Erfolg ohne Verifikation). */
  protocolErrors: string[]
}

export interface NexoraState {
  runs: Record<string, RunState>
  runOrder: string[]
  approvals: Record<string, ApprovalState>
  artifacts: ArtifactState[]
  /** Akzeptierte Events in Eingangsreihenfolge (für Ereignisprotokoll und Kostenverlauf). */
  log: NexoraEvent[]
  seenIds: Record<string, true>
}

export const initialState: NexoraState = {
  runs: {},
  runOrder: [],
  approvals: {},
  artifacts: [],
  log: [],
  seenIds: {}
}

const TERMINAL: ReadonlySet<RunStatus> = new Set(['succeeded', 'failed', 'cancelled'])

export function isTerminal(status: RunStatus): boolean {
  return TERMINAL.has(status)
}

/** Fortschritt 0..1 oder null, wenn die Schrittzahl unbekannt ist (indeterminiert). */
export function progressOf(run: RunState): number | null {
  if (run.stepsTotal === undefined || run.stepsTotal === 0) return null
  return Math.min(1, run.stepsDone / run.stepsTotal)
}

function withRun(state: NexoraState, run: RunState): NexoraState {
  return { ...state, runs: { ...state.runs, [run.runId]: run } }
}

function updateStep(run: RunState, stepId: string, patch: Partial<StepState>, title?: string): RunState {
  const exists = run.steps.some((s) => s.id === stepId)
  const steps = exists
    ? run.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s))
    : [...run.steps, { id: stepId, title: title ?? stepId, status: 'pending' as StepStatus, ...patch }]
  return { ...run, steps }
}

function protocolError(state: NexoraState, run: RunState, message: string): NexoraState {
  return withRun(state, { ...run, protocolErrors: [...run.protocolErrors, message] })
}

/**
 * Reiner Reducer: wendet genau ein Event an. Doppelte Event-IDs werden ignoriert (Replay-sicher).
 * Status und Fortschritt entstehen ausschließlich hier aus Events – nie aus Annahmen in der UI.
 */
export function applyEvent(state: NexoraState, event: NexoraEvent): NexoraState {
  if (state.seenIds[event.id]) return state
  const parsed = PAYLOAD_SCHEMAS[event.type].safeParse(event.payload)

  let next: NexoraState = {
    ...state,
    log: [...state.log, event],
    seenIds: { ...state.seenIds, [event.id]: true }
  }

  const existing = next.runs[event.runId]

  if (event.type === 'run_created') {
    if (existing) return next
    const p = parsed.success ? (parsed.data as { title: string; agentName?: string }) : undefined
    const run: RunState = {
      runId: event.runId,
      taskId: event.taskId,
      source: event.source,
      title: p?.title ?? 'Unbenannter Vorgang',
      agentId: event.agentId,
      agentName: p?.agentName,
      status: event.status,
      planReady: false,
      steps: [],
      stepsDone: 0,
      createdAt: event.timestamp,
      costUsd: 0,
      protocolErrors: parsed.success ? [] : [`run_created: ungültige Payload`]
    }
    next = withRun(next, run)
    return { ...next, runOrder: [...next.runOrder, run.runId] }
  }

  if (!existing) return next // Event zu unbekanntem Run: nur protokollieren
  if (!parsed.success) return protocolError(next, existing, `${event.type}: ungültige Payload`)
  if (existing.source !== event.source) {
    return protocolError(next, existing, `${event.type}: Quelle ${event.source} passt nicht zum Run`)
  }
  if (isTerminal(existing.status) && event.type !== 'cost_updated') {
    return protocolError(next, existing, `${event.type}: Run ist bereits abgeschlossen`)
  }

  const run: RunState = { ...existing, agentId: existing.agentId ?? event.agentId }

  switch (event.type) {
    case 'plan_ready': {
      const { steps } = PAYLOAD_SCHEMAS.plan_ready.parse(event.payload)
      return withRun(next, {
        ...run,
        status: event.status,
        planReady: true,
        steps: steps.map((s) => ({ ...s, status: 'pending' as StepStatus })),
        stepsTotal: steps.length
      })
    }
    case 'step_started': {
      if (!event.stepId) return protocolError(next, run, 'step_started ohne stepId')
      const { title } = PAYLOAD_SCHEMAS.step_started.parse(event.payload)
      const updated = updateStep(run, event.stepId, { status: 'running' }, title)
      return withRun(next, { ...updated, status: event.status, currentStepId: event.stepId })
    }
    case 'step_succeeded': {
      if (!event.stepId) return protocolError(next, run, 'step_succeeded ohne stepId')
      const prev = run.steps.find((s) => s.id === event.stepId)
      if (prev?.status === 'succeeded') return next
      const { summary } = PAYLOAD_SCHEMAS.step_succeeded.parse(event.payload)
      const updated = updateStep(run, event.stepId, { status: 'succeeded', summary })
      return withRun(next, {
        ...updated,
        status: event.status,
        stepsDone: run.stepsDone + 1,
        currentStepId: run.currentStepId === event.stepId ? undefined : run.currentStepId
      })
    }
    case 'step_failed': {
      if (!event.stepId) return protocolError(next, run, 'step_failed ohne stepId')
      const { error } = PAYLOAD_SCHEMAS.step_failed.parse(event.payload)
      return withRun(next, { ...updateStep(run, event.stepId, { status: 'failed', error }), status: event.status })
    }
    case 'approval_requested': {
      const p = PAYLOAD_SCHEMAS.approval_requested.parse(event.payload)
      next = withRun(next, { ...run, status: 'waiting_approval' })
      return {
        ...next,
        approvals: {
          ...next.approvals,
          [p.approvalId]: {
            id: p.approvalId,
            runId: run.runId,
            source: event.source,
            action: p.action,
            target: p.target,
            data: p.data,
            impact: p.impact,
            requestedAt: event.timestamp
          }
        }
      }
    }
    case 'approval_resolved': {
      const p = PAYLOAD_SCHEMAS.approval_resolved.parse(event.payload)
      const approval = next.approvals[p.approvalId]
      if (!approval || approval.runId !== run.runId) {
        return protocolError(next, run, `approval_resolved: unbekannte Freigabe ${p.approvalId}`)
      }
      next = withRun(next, { ...run, status: event.status })
      return {
        ...next,
        approvals: {
          ...next.approvals,
          [p.approvalId]: { ...approval, decision: p.decision, resolvedAt: event.timestamp }
        }
      }
    }
    case 'artifact_created': {
      const p = PAYLOAD_SCHEMAS.artifact_created.parse(event.payload)
      next = withRun(next, { ...run, status: event.status })
      return {
        ...next,
        artifacts: [
          ...next.artifacts,
          { id: p.artifactId, runId: run.runId, kind: p.kind, name: p.name, uri: p.uri, createdAt: event.timestamp }
        ]
      }
    }
    case 'run_succeeded': {
      const { verification } = PAYLOAD_SCHEMAS.run_succeeded.parse(event.payload)
      return withRun(next, { ...run, status: 'succeeded', verification, endedAt: event.timestamp, currentStepId: undefined })
    }
    case 'run_failed': {
      const { error } = PAYLOAD_SCHEMAS.run_failed.parse(event.payload)
      return withRun(next, { ...run, status: 'failed', error, endedAt: event.timestamp, currentStepId: undefined })
    }
    case 'run_cancelled': {
      const { reason } = PAYLOAD_SCHEMAS.run_cancelled.parse(event.payload)
      return withRun(next, { ...run, status: 'cancelled', error: reason, endedAt: event.timestamp, currentStepId: undefined })
    }
    case 'cost_updated': {
      const { totalUsd } = PAYLOAD_SCHEMAS.cost_updated.parse(event.payload)
      return withRun(next, { ...run, costUsd: totalUsd })
    }
  }
}

export function reduceEvents(events: readonly NexoraEvent[], state: NexoraState = initialState): NexoraState {
  return [...events].sort((a, b) => a.seq - b.seq).reduce(applyEvent, state)
}
