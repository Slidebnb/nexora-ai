import type { ApprovalDecision } from '@shared/events'
import type { Capability } from '@shared/ipc-contract'
import type { ApprovalState, NexoraState, RunState } from '../state/runReducer'
import { isTerminal } from '../state/runReducer'
import { respondDemoApproval, stopDemoRun } from '../demo/controller'
import { resyncFromWorker } from './liveBridge'

/** IPC-Fehlermeldungen ohne technisches Präfix. */
export function cleanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export async function respondApproval(approval: ApprovalState, decision: ApprovalDecision): Promise<void> {
  if (approval.source === 'demo') {
    respondDemoApproval(approval.id, decision)
    return
  }
  try {
    await window.nexora.respondApproval(approval.id, decision)
  } catch (e) {
    // Bereits entschieden (z. B. Doppelklick oder verpasstes Event): Stand nachladen statt Fehler zeigen.
    if (/bereits entschieden/.test(cleanError(e))) {
      await resyncFromWorker()
      return
    }
    throw e
  }
}

export async function stopRun(run: RunState): Promise<void> {
  if (isTerminal(run.status)) return
  if (run.source === 'demo') stopDemoRun(run.runId)
  else await window.nexora.cancelTask(run.taskId)
}

export const UNDO_CAPS: Capability[] = ['files.move']

/** Rückgängig machen ist möglich, wenn ein Undo-Protokoll existiert und noch kein Undo erfolgreich lief. */
export function canUndo(state: NexoraState, run: RunState): boolean {
  if (run.source !== 'live' || run.workflow !== 'organize_folder') return false
  if (run.status !== 'succeeded' && run.status !== 'cancelled') return false
  const hasJournal = state.artifacts.some((a) => a.runId === run.runId && a.name === 'Undo-Protokoll.json')
  const undone = Object.values(state.runs).some((r) => r.workflow === 'undo_organize' && r.relatedRunId === run.runId && (r.status === 'succeeded' || !isTerminal(r.status)))
  return hasJournal && !undone
}

export async function undoRun(run: RunState): Promise<void> {
  await window.nexora.createTask({ workflow: 'undo_organize', runId: run.runId, capabilities: UNDO_CAPS })
}
