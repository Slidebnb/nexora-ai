import type { ApprovalDecision, EventType, NexoraEvent, RunStatus } from '@shared/events'
import type { DemoScenario } from './scenarios'

type Emit = (event: NexoraEvent) => void

interface ActiveRun {
  scenario: DemoScenario
  runId: string
  stepIndex: number
  costUsd: number
  timer?: ReturnType<typeof setTimeout>
  pendingApprovalId?: string
}

/**
 * Spielt Demo-Szenarien als Events mit source 'demo' ab. Alle Zustandsänderungen laufen
 * über denselben Reducer wie Live-Events; der Player führt keinerlei echte Aktionen aus.
 */
export class DemoPlayer {
  private seq = 0
  private counter = 0
  private runs = new Map<string, ActiveRun>()

  constructor(
    private readonly emit: Emit,
    private readonly speed = 1,
    private readonly now: () => Date = () => new Date()
  ) {}

  start(scenario: DemoScenario): string {
    this.counter += 1
    const runId = `demo-run-${this.counter}`
    const run: ActiveRun = { scenario, runId, stepIndex: 0, costUsd: 0 }
    this.runs.set(runId, run)
    this.send(run, 'run_created', 'queued', { title: scenario.title, agentName: scenario.agentName })
    this.later(run, 600, () => {
      this.send(run, 'plan_ready', 'running', {
        steps: scenario.steps.map((s) => ({ id: s.id, title: s.title }))
      })
      this.nextStep(run)
    })
    return runId
  }

  respondApproval(approvalId: string, decision: ApprovalDecision): boolean {
    const run = [...this.runs.values()].find((r) => r.pendingApprovalId === approvalId)
    if (!run) return false
    run.pendingApprovalId = undefined
    const approved = decision === 'allow'
    this.send(run, 'approval_resolved', 'running', { approvalId, decision })
    if (approved) {
      this.runStep(run)
    } else {
      this.finish(run, 'run_cancelled', 'cancelled', {
        reason: decision === 'deny' ? 'Freigabe abgelehnt, Aktion nicht ausgeführt' : 'Vom Nutzer abgebrochen'
      })
    }
    return true
  }

  cancel(runId: string): void {
    const run = this.runs.get(runId)
    if (!run) return
    if (run.pendingApprovalId) {
      this.send(run, 'approval_resolved', 'running', { approvalId: run.pendingApprovalId, decision: 'cancel' })
    }
    this.finish(run, 'run_cancelled', 'cancelled', { reason: 'Vom Nutzer gestoppt' })
  }

  cancelAll(): void {
    for (const runId of [...this.runs.keys()]) this.cancel(runId)
  }

  /** Bricht alles ab, ohne Events zu senden (z. B. wenn der Demo-Modus verlassen wird). */
  dispose(): void {
    for (const run of this.runs.values()) clearTimeout(run.timer)
    this.runs.clear()
  }

  get activeRunIds(): string[] {
    return [...this.runs.keys()]
  }

  private nextStep(run: ActiveRun): void {
    const step = run.scenario.steps[run.stepIndex]
    if (!step) {
      this.send(run, 'artifact_created', 'running', {
        artifactId: `${run.runId}-artifact`,
        kind: run.scenario.artifact.kind,
        name: run.scenario.artifact.name
      })
      this.later(run, 400, () =>
        this.finish(run, 'run_succeeded', 'succeeded', { verification: run.scenario.verification })
      )
      return
    }
    if (step.approval) {
      const approvalId = `${run.runId}-${step.id}-approval`
      run.pendingApprovalId = approvalId
      this.send(run, 'approval_requested', 'waiting_approval', { approvalId, ...step.approval })
      return // wartet auf respondApproval
    }
    this.runStep(run)
  }

  private runStep(run: ActiveRun): void {
    const step = run.scenario.steps[run.stepIndex]
    if (!step) return
    this.send(run, 'step_started', 'running', { title: step.title }, step.id)
    this.later(run, step.ms, () => {
      if (step.fails) {
        this.send(run, 'step_failed', 'running', { error: step.fails }, step.id)
      } else {
        this.send(run, 'step_succeeded', 'running', {}, step.id)
      }
      if (step.costUsd) {
        run.costUsd = Math.round((run.costUsd + step.costUsd) * 1e6) / 1e6
        this.send(run, 'cost_updated', 'running', { totalUsd: run.costUsd })
      }
      run.stepIndex += 1
      this.nextStep(run)
    })
  }

  private finish(run: ActiveRun, type: EventType, status: RunStatus, payload: Record<string, unknown>): void {
    clearTimeout(run.timer)
    this.send(run, type, status, payload)
    this.runs.delete(run.runId)
  }

  private later(run: ActiveRun, ms: number, fn: () => void): void {
    run.timer = setTimeout(() => {
      if (this.runs.has(run.runId)) fn()
    }, ms / this.speed)
  }

  private send(
    run: ActiveRun,
    type: EventType,
    status: RunStatus,
    payload: Record<string, unknown>,
    stepId?: string
  ): void {
    this.seq += 1
    this.emit({
      id: `demo-evt-${this.seq}`,
      seq: this.seq,
      runId: run.runId,
      taskId: `demo-task-${run.scenario.id}`,
      timestamp: this.now().toISOString(),
      type,
      status,
      agentId: run.scenario.agentId,
      stepId,
      source: 'demo',
      payload
    })
  }
}
