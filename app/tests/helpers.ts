import type { EventSource, EventType, NexoraEvent, RunStatus } from '../src/shared/events'

let seq = 0
export function resetSeq(): void {
  seq = 0
}

export function ev(
  type: EventType,
  status: RunStatus,
  payload: Record<string, unknown> = {},
  extra: Partial<NexoraEvent> & { source?: EventSource } = {}
): NexoraEvent {
  seq += 1
  return {
    id: `e${seq}`,
    seq,
    runId: 'r1',
    taskId: 't1',
    timestamp: new Date(Date.UTC(2026, 9, 31, 10, 0, seq)).toISOString(),
    type,
    status,
    source: 'live',
    agentId: 'a1',
    payload,
    ...extra
  }
}
