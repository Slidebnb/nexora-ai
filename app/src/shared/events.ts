import { z } from 'zod'

/** Event-Vertrag laut docs/ARCHITECTURE.md. Worker, Demo-Generator und UI nutzen dieselben Typen. */
export const RUN_STATUSES = [
  'queued',
  'running',
  'waiting_approval',
  'succeeded',
  'failed',
  'cancelled'
] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

export const EVENT_TYPES = [
  'run_created',
  'plan_ready',
  'step_started',
  'step_succeeded',
  'step_failed',
  'approval_requested',
  'approval_resolved',
  'artifact_created',
  'run_succeeded',
  'run_failed',
  'run_cancelled',
  'cost_updated'
] as const
export type EventType = (typeof EVENT_TYPES)[number]

export const EventSourceSchema = z.enum(['live', 'demo'])
export type EventSource = z.infer<typeof EventSourceSchema>

export const NexoraEventSchema = z.object({
  id: z.string().min(1),
  seq: z.number().int().nonnegative(),
  runId: z.string().min(1),
  taskId: z.string().min(1),
  timestamp: z.string().min(1),
  type: z.enum(EVENT_TYPES),
  status: z.enum(RUN_STATUSES),
  agentId: z.string().optional(),
  stepId: z.string().optional(),
  source: EventSourceSchema,
  payload: z.record(z.string(), z.unknown())
})
export type NexoraEvent = z.infer<typeof NexoraEventSchema>

export const ApprovalDecisionSchema = z.enum(['allow', 'deny', 'cancel'])
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>

export const ArtifactKindSchema = z.enum(['table', 'file', 'link', 'export'])
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>

/** Payload-Schemas je Eventtyp. Unbekannte Zusatzfelder sind erlaubt. */
export const PAYLOAD_SCHEMAS = {
  run_created: z.object({ title: z.string(), agentName: z.string().optional(), workflow: z.string().optional(), relatedRunId: z.string().optional() }),
  plan_ready: z.object({
    steps: z.array(z.object({ id: z.string(), title: z.string() }))
  }),
  step_started: z.object({ title: z.string().optional() }),
  step_succeeded: z.object({ summary: z.string().optional() }),
  step_failed: z.object({ error: z.string() }),
  approval_requested: z.object({
    approvalId: z.string(),
    action: z.string(),
    target: z.string(),
    data: z.string(),
    impact: z.string()
  }),
  approval_resolved: z.object({ approvalId: z.string(), decision: ApprovalDecisionSchema }),
  artifact_created: z.object({
    artifactId: z.string(),
    kind: ArtifactKindSchema,
    name: z.string(),
    uri: z.string().optional()
  }),
  run_succeeded: z.object({ verification: z.string().min(1) }),
  run_failed: z.object({ error: z.string() }),
  run_cancelled: z.object({ reason: z.string().optional() }),
  cost_updated: z.object({ totalUsd: z.number().nonnegative() })
} satisfies Record<EventType, z.ZodType>
