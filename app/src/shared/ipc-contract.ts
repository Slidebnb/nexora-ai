import { z } from 'zod'
import { ApprovalDecisionSchema, NexoraEventSchema } from './events'

/**
 * Einzige Quelle der erlaubten IPC-Kanäle zwischen Renderer und Main.
 * Jeder Kanal hat ein Schema für Anfrage und Antwort; alles andere wird abgelehnt.
 */
export const AppInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.string()
})
export type AppInfo = z.infer<typeof AppInfoSchema>

export const PROVIDERS = ['anthropic', 'openai'] as const
export const ProviderSchema = z.enum(PROVIDERS)
export type Provider = z.infer<typeof ProviderSchema>

/** Der Renderer erfährt nur, ob ein Schlüssel hinterlegt ist – nie den Schlüssel selbst. */
export const SecretStatusSchema = z.object({
  encryptionAvailable: z.boolean(),
  configured: z.record(ProviderSchema, z.boolean())
})
export type SecretStatus = z.infer<typeof SecretStatusSchema>

export const ApiKeySchema = z
  .string()
  .trim()
  .min(20, 'Schlüssel ist zu kurz')
  .max(400, 'Schlüssel ist zu lang')
  .regex(/^\S+$/, 'Schlüssel darf keine Leerzeichen enthalten')

export const WorkerStatusSchema = z.object({
  state: z.enum(['disconnected', 'starting', 'connected', 'error']),
  message: z.string().optional()
})
export type WorkerStatus = z.infer<typeof WorkerStatusSchema>

/** Fähigkeiten, die der Nutzer pro Aufgabe ausdrücklich erlaubt (muss zum Worker-Workflow passen). */
export const CapabilitySchema = z.enum(['files.read', 'files.move', 'web.read', 'files.export', 'pdf.read', 'drafts.write'])
export type Capability = z.infer<typeof CapabilitySchema>

export const PickedFolderSchema = z.object({ folderId: z.string(), name: z.string(), path: z.string() })
export type PickedFolder = z.infer<typeof PickedFolderSchema>

const Caps = z.array(CapabilitySchema).max(10)
export const CreateTaskSchema = z.discriminatedUnion('workflow', [
  z.object({ workflow: z.literal('organize_folder'), folderId: z.string().min(1), capabilities: Caps }),
  z.object({ workflow: z.literal('undo_organize'), runId: z.string().regex(/^run-[a-z0-9]+$/), capabilities: Caps }),
  z.object({
    workflow: z.literal('web_research'),
    question: z.string().trim().min(3).max(500),
    urls: z.array(z.url({ protocol: /^https?$/ })).min(1).max(10),
    capabilities: Caps
  })
])
export type CreateTask = z.infer<typeof CreateTaskSchema>

const Ok = z.object({ ok: z.boolean() })

export const IPC_CHANNELS = {
  'app:getInfo': { request: z.undefined(), response: AppInfoSchema },
  'secrets:status': { request: z.undefined(), response: SecretStatusSchema },
  'secrets:set': {
    request: z.object({ provider: ProviderSchema, key: ApiKeySchema }),
    response: SecretStatusSchema
  },
  'secrets:clear': { request: z.object({ provider: ProviderSchema }), response: SecretStatusSchema },
  'worker:status': { request: z.undefined(), response: WorkerStatusSchema },
  'worker:history': { request: z.undefined(), response: z.array(NexoraEventSchema) },
  'dialog:pickFolder': { request: z.undefined(), response: PickedFolderSchema.nullable() },
  'tasks:create': { request: CreateTaskSchema, response: z.object({ taskId: z.string(), runId: z.string() }) },
  'tasks:cancel': { request: z.object({ taskId: z.string().min(1) }), response: Ok },
  'approvals:respond': { request: z.object({ approvalId: z.string().min(1), decision: ApprovalDecisionSchema }), response: Ok },
  'files:reveal': { request: z.object({ artifactId: z.string().min(1) }), response: Ok }
} as const

/** Kanäle, auf denen der Main-Prozess an den Renderer sendet (kein invoke). */
export const PUSH_CHANNELS = ['worker:event', 'worker:status'] as const

export type IpcChannel = keyof typeof IPC_CHANNELS
export type IpcRequest<C extends IpcChannel> = z.infer<(typeof IPC_CHANNELS)[C]['request']>
export type IpcResponse<C extends IpcChannel> = z.infer<(typeof IPC_CHANNELS)[C]['response']>

export function isIpcChannel(value: unknown): value is IpcChannel {
  return typeof value === 'string' && Object.hasOwn(IPC_CHANNELS, value)
}
