import type { ApprovalDecision } from '@shared/events'
import { useNexora } from '../state/store'
import { DemoPlayer } from './demoPlayer'
import { DEMO_SCENARIOS } from './scenarios'

let player: DemoPlayer | null = null

function getPlayer(): DemoPlayer {
  player ??= new DemoPlayer((e) => useNexora.getState().ingest(e))
  return player
}

export function enterDemo(): void {
  useNexora.getState().setDemoMode(true)
}

export function exitDemo(): void {
  player?.dispose()
  player = null
  useNexora.getState().setDemoMode(false)
}

export function startDemoScenario(scenarioId: string): string | null {
  if (!useNexora.getState().demoMode) return null
  const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId)
  return scenario ? getPlayer().start(scenario) : null
}

/** Freigaben für Demo-Läufe gehen an den Player. Live-Freigaben folgen mit dem Worker (Phase 2). */
export function respondDemoApproval(approvalId: string, decision: ApprovalDecision): boolean {
  return player?.respondApproval(approvalId, decision) ?? false
}

export function stopDemoRun(runId: string): void {
  player?.cancel(runId)
}

export function stopAllDemoRuns(): void {
  player?.cancelAll()
}
