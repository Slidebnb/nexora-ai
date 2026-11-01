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

// Secret-Provider (brauchen einen Schlüssel). Ollama läuft lokal ohne Schlüssel und ist KEIN Secret-Provider.
export const PROVIDERS = ['anthropic', 'openai'] as const
// KI-Anbieter im Chat: zusätzlich „ollama" (lokales Modell, datenschutzfreundlich, ohne Cloud).
export const CHAT_PROVIDERS = ['anthropic', 'openai', 'ollama'] as const
/** Zusätzlicher, nicht als API-Anbieter angezeigter Eintrag im verschlüsselten Speicher. */
export const LICENSE_SECRET = 'license' as const
export const ProviderSchema = z.enum(CHAT_PROVIDERS)
export type Provider = z.infer<typeof ProviderSchema>
/** Anbieter, die einen Schlüssel brauchen (anthropic/openai); Ollama ist lokal und gehört NICHT dazu. */
export type SecretProvider = (typeof PROVIDERS)[number]

/** Der Renderer erfährt nur, ob ein Schlüssel hinterlegt ist – nie den Schlüssel selbst. */
export const SecretStatusSchema = z.object({
  encryptionAvailable: z.boolean(),
  configured: z.record(z.enum(PROVIDERS), z.boolean())
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
export const CapabilitySchema = z.enum(['files.read', 'files.move', 'web.read', 'files.export', 'pdf.read', 'ai.cloud', 'drafts.write', 'files.write', 'desktop.read', 'desktop.control', 'connectors.use', 'email.send'])

export const CAPABILITY_LABEL: Record<z.infer<typeof CapabilitySchema>, string> = {
  'files.read': 'Dateien lesen',
  'files.move': 'Dateien verschieben (mit Freigabe)',
  'web.read': 'öffentliche Webseiten lesen',
  'files.export': 'Ergebnisse exportieren',
  'pdf.read': 'ausgewählte PDFs lesen',
  'ai.cloud': 'Inhalte an KI-Anbieter senden (mit Freigabe, Kosten)',
  'drafts.write': 'Entwürfe erstellen',
  'files.write': 'Dateien speichern (mit Freigabe)',
  'desktop.read': 'Programmfenster lesen',
  'desktop.control': 'Programm bedienen (mit Freigabe)',
  'connectors.use': 'Verbundene Dienste nutzen (mit Freigabe)',
  'email.send': 'E-Mails senden (mit Freigabe)'
}
export type Capability = z.infer<typeof CapabilitySchema>

export const PickedFolderSchema = z.object({ folderId: z.string(), name: z.string(), path: z.string() })
export type PickedFolder = z.infer<typeof PickedFolderSchema>
export const PickedFileSchema = z.object({ fileId: z.string(), name: z.string(), path: z.string() })
export type PickedFile = z.infer<typeof PickedFileSchema>

export const SmtpConfigSchema = z.object({
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  security: z.enum(['ssl', 'starttls', 'none']),
  user: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1024),
  fromAddr: z.string().trim().email()
})
export type SmtpConfig = z.infer<typeof SmtpConfigSchema>
export const SmtpStatusSchema = z.object({ host: z.string(), port: z.number().int(), security: z.enum(['ssl', 'starttls', 'none']), user: z.string(), fromAddr: z.string() }).nullable()
export type SmtpStatus = z.infer<typeof SmtpStatusSchema>

const Caps = z.array(CapabilitySchema).max(10)

/** Element eines Programmfensters (Windows UI Automation), wie es der Worker liefert. */
export const DesktopElementSchema = z.object({
  control_type: z.string().min(1).max(40),
  name: z.string().max(120),
  automation_id: z.string().max(120),
  parent_name: z.string().max(80),
  left: z.number().int(),
  top: z.number().int(),
  right: z.number().int(),
  bottom: z.number().int(),
  is_password: z.boolean(),
  label: z.string().max(200)
})
export type DesktopElement = z.infer<typeof DesktopElementSchema>
export const DesktopStepSchema = z.object({
  action: z.enum(['click', 'type']),
  element: DesktopElementSchema.omit({ is_password: true, label: true }),
  text: z.string().max(5000).default('')
})
export type DesktopStep = z.infer<typeof DesktopStepSchema>
export const DesktopWindowSchema = z.object({ title: z.string().max(200), pid: z.number().int() })
export type DesktopWindow = z.infer<typeof DesktopWindowSchema>

/** Konnektor (MCP-Dienst), den der Kunde hinzufügt. Das Token liegt nur im sicheren Speicher. */
export const ConnectorSchema = z.object({ id: z.string(), name: z.string().max(80), url: z.string().max(2000), hasToken: z.boolean(), createdAt: z.string() })
export type Connector = z.infer<typeof ConnectorSchema>
export const ConnectorTestSchema = z.object({ ok: z.boolean(), message: z.string().max(400), toolCount: z.number().int().nonnegative() })
export type ConnectorTest = z.infer<typeof ConnectorTestSchema>
export const ConnectorToolSchema = z.object({ name: z.string().max(100), description: z.string().max(500), inputSchema: z.unknown() })
export type ConnectorTool = z.infer<typeof ConnectorToolSchema>
export const CreateTaskSchema = z.discriminatedUnion('workflow', [
  z.object({ workflow: z.literal('organize_folder'), folderId: z.string().min(1), newerThanHours: z.number().int().min(1).max(8760).optional(), capabilities: Caps }),
  z.object({ workflow: z.literal('undo_organize'), runId: z.string().regex(/^run-[a-z0-9]+$/), capabilities: Caps }),
  z.object({
    workflow: z.literal('web_research'),
    question: z.string().trim().min(3).max(500),
    urls: z.array(z.url({ protocol: /^https?$/ })).min(1).max(10),
    /** KI-Browser (browser-use): sendet Inhalte an den KI-Anbieter, braucht „ai.cloud“ und eine Freigabe */
    useCloudAi: z.boolean().default(false),
    capabilities: Caps
  }),
  z.object({ workflow: z.literal('pdf_analysis'), fileIds: z.array(z.string().min(1)).min(1).max(20), useCloudAi: z.boolean(), useOcr: z.boolean().default(false), capabilities: Caps }),
  z.object({
    workflow: z.literal('draft_emails'),
    subject: z.string().trim().min(1).max(200),
    briefing: z.string().trim().min(10).max(5000),
    recipients: z.array(z.object({ name: z.string().max(120), email: z.email() })).min(1).max(50),
    outFolderId: z.string().min(1),
    useCloudAi: z.boolean(),
    capabilities: Caps
  }),
  z.object({ workflow: z.literal('desktop_routine'), window: z.string().trim().min(1).max(200), steps: z.array(DesktopStepSchema).min(1).max(30), capabilities: Caps }),
  /** KI-Desktop-Modus (Computer Use): Bildschirmfotos des Fensters gehen an den KI-Anbieter, jede Aktion mit Freigabe */
  z.object({ workflow: z.literal('desktop_ai'), window: z.string().trim().min(1).max(200), goal: z.string().trim().min(5).max(1000), capabilities: Caps })
])
export type CreateTask = z.infer<typeof CreateTaskSchema>

const Ok = z.object({ ok: z.boolean() })

export const THEMES = ['crimson', 'cyan', 'violet', 'minimal'] as const
// Lokales KI-Modell (Ollama): läuft auf dem PC, ohne Cloud/Schlüssel. Datenschutzfreundlich.
export const OllamaSettingsSchema = z.object({
  enabled: z.boolean(),
  model: z.string().trim().min(1).max(100),
  baseUrl: z.string().trim().url().max(300)
})
export type OllamaSettings = z.infer<typeof OllamaSettingsSchema>
/** Voicestudio: Premium-Stimmen von OpenAI (TTS) + Diktat (Whisper). Nutzt den vorhandenen OpenAI-Schlüssel. */
export const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const
export const VoiceSettingsSchema = z.object({
  enabled: z.boolean(),
  voice: z.enum(OPENAI_VOICES),
  /** KI-Antworten im Chat automatisch vorlesen. */
  autoSpeak: z.boolean()
})
export type VoiceSettings = z.infer<typeof VoiceSettingsSchema>
export const AppSettingsSchema = z.object({
  onboarded: z.boolean(),
  theme: z.enum(THEMES),
  notifications: z.boolean(),
  ollama: OllamaSettingsSchema.optional(),
  voice: VoiceSettingsSchema.optional()
})
export type AppSettings = z.infer<typeof AppSettingsSchema>

export const LicenseStatusSchema = z.object({
  state: z.enum(['unconfigured', 'trial', 'active', 'expired', 'trial_over']),
  plan: z.string().optional(),
  features: z.array(z.string()),
  expiresAt: z.string().optional(),
  keyHint: z.string().optional(),
  message: z.string().optional()
})
export type LicenseStatus = z.infer<typeof LicenseStatusSchema>

export const ScheduleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('daily'), time: z.string().regex(/^\d{1,2}:\d{2}$/) }),
  z.object({ type: z.literal('interval'), minutes: z.number().int().min(15).max(10080) })
])
export type Schedule = z.infer<typeof ScheduleSchema>

export const TemplateSchema = z.object({
  templateId: z.string(),
  name: z.string(),
  version: z.number(),
  versions: z.number(),
  workflow: z.string(),
  input: z.record(z.string(), z.unknown()),
  capabilities: z.array(z.string()),
  sourceRunId: z.string(),
  schedule: ScheduleSchema.nullable(),
  lastRunAt: z.string().nullable(),
  createdAt: z.string()
})
export type Template = z.infer<typeof TemplateSchema>

/** Echter Systemstatus vom Worker (Masterplan „SystemStatus“) – nur gemessene Werte. */
export const SystemStatusSchema = z.object({
  worker: z.object({ version: z.string(), python: z.string(), platform: z.string(), uptimeSeconds: z.number().int().nonnegative(), frozen: z.boolean() }),
  database: z.object({ schemaVersion: z.number().int(), bytes: z.number().int().nonnegative(), runs: z.number().int().nonnegative(), events: z.number().int().nonnegative(), templates: z.number().int().nonnegative() }),
  disk: z.object({ total: z.number().nonnegative(), used: z.number().nonnegative(), free: z.number().nonnegative() }),
  ocr: z.object({ available: z.boolean(), version: z.string().nullable() }),
  browserUse: z.object({ installed: z.boolean(), version: z.string().nullable() }),
  ai: z.object({ anthropic: z.boolean(), openai: z.boolean() }),
  workflows: z.array(z.string())
})
export type SystemStatus = z.infer<typeof SystemStatusSchema>
export const AiTestResultSchema = z.object({ ok: z.boolean(), message: z.string().max(300) })
export type AiTestResult = z.infer<typeof AiTestResultSchema>

export const ChatMessageSchema = z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(100000) })
export type ChatMessage = z.infer<typeof ChatMessageSchema>
// delta = Textstück der Antwort; step = sichtbarer Agent-Schritt („arbeitet …"). Pro Nachricht genau eines.
export const ChatDeltaSchema = z.object({ id: z.string(), delta: z.string().optional(), step: z.string().max(200).optional() })
export type ChatDelta = z.infer<typeof ChatDeltaSchema>

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
  'dialog:pickFiles': { request: z.object({ kind: z.enum(['pdf']) }), response: z.array(PickedFileSchema) },
  'tasks:create': { request: CreateTaskSchema, response: z.object({ taskId: z.string(), runId: z.string() }) },
  'tasks:cancel': { request: z.object({ taskId: z.string().min(1) }), response: Ok },
  'tasks:pause': { request: z.object({ taskId: z.string().min(1) }), response: Ok },
  'tasks:resume': { request: z.object({ taskId: z.string().min(1) }), response: Ok },
  'approvals:respond': { request: z.object({ approvalId: z.string().min(1), decision: ApprovalDecisionSchema }), response: Ok },
  'files:reveal': { request: z.object({ artifactId: z.string().min(1) }), response: Ok },
  'settings:get': { request: z.undefined(), response: AppSettingsSchema },
  'settings:update': { request: AppSettingsSchema.partial(), response: AppSettingsSchema },
  'onboarding:practiceFolder': { request: z.undefined(), response: PickedFolderSchema },
  'license:status': { request: z.undefined(), response: LicenseStatusSchema },
  'license:activate': { request: z.object({ licenseKey: z.string().trim().regex(/^NXR(-[A-Za-z2-9]{5}){4}$/, 'Format: NXR-XXXXX-XXXXX-XXXXX-XXXXX') }), response: LicenseStatusSchema },
  'license:clear': { request: z.undefined(), response: LicenseStatusSchema },
  'templates:list': { request: z.undefined(), response: z.array(TemplateSchema) },
  'templates:create': { request: z.object({ runId: z.string().regex(/^run-[a-z0-9]+$/), name: z.string().trim().min(1).max(80) }), response: TemplateSchema },
  'templates:run': {
    request: z.object({
      templateId: z.string().min(1),
      folderId: z.string().optional(),
      fileIds: z.array(z.string()).max(20).optional(),
      outFolderId: z.string().optional()
    }),
    response: z.object({ taskId: z.string(), runId: z.string() })
  },
  'templates:schedule': { request: z.object({ templateId: z.string().min(1), schedule: ScheduleSchema.nullable() }), response: TemplateSchema },
  'templates:delete': { request: z.object({ templateId: z.string().min(1) }), response: Ok },
  'system:status': { request: z.undefined(), response: SystemStatusSchema },
  'ai:test': { request: z.object({ provider: ProviderSchema }), response: AiTestResultSchema },
  'desktop:windows': { request: z.undefined(), response: z.array(DesktopWindowSchema).max(200) },
  'desktop:elements': { request: z.object({ window: z.string().trim().min(1).max(200) }), response: z.array(DesktopElementSchema).max(500) },
  'connectors:list': { request: z.undefined(), response: z.array(ConnectorSchema).max(50) },
  'connectors:add': { request: z.object({ name: z.string().trim().min(1).max(80), url: z.string().trim().min(1).max(2000), token: z.string().max(4000).optional() }), response: ConnectorSchema },
  'connectors:remove': { request: z.object({ id: z.string().min(1) }), response: Ok },
  'connectors:test': { request: z.object({ id: z.string().min(1) }), response: ConnectorTestSchema },
  'connectors:tools': { request: z.object({ id: z.string().min(1) }), response: z.array(ConnectorToolSchema).max(200) },
  'chat:provider': { request: z.undefined(), response: z.object({ provider: ProviderSchema.nullable(), model: z.string().nullable() }) },
  'chat:send': { request: z.object({ id: z.string().min(1).max(64), messages: z.array(ChatMessageSchema).min(1).max(100) }), response: z.object({ text: z.string(), model: z.string(), provider: ProviderSchema }) },
  'chat:cancel': { request: z.object({ id: z.string().min(1).max(64) }), response: Ok },
  // Voicestudio (OpenAI): Text -> Audio (TTS) und Audio -> Text (Whisper). Schlüssel bleibt im Main-Prozess.
  'voice:speak': { request: z.object({ text: z.string().trim().min(1).max(4000) }), response: z.object({ audioBase64: z.string(), mime: z.string() }) },
  'voice:transcribe': { request: z.object({ audioBase64: z.string().min(1), mime: z.string().max(100) }), response: z.object({ text: z.string() }) },
  'email:get': { request: z.undefined(), response: SmtpStatusSchema },
  'email:set': { request: SmtpConfigSchema, response: SmtpStatusSchema },
  'email:clear': { request: z.undefined(), response: SmtpStatusSchema },
  'email:test': { request: z.undefined(), response: z.object({ ok: z.boolean(), message: z.string().max(300) }) },
  // Öffnet eine Hilfe-/Anbieter-Seite im echten Browser. Der Main-Prozess prüft die Adresse gegen eine feste Allowlist.
  'shell:openExternal': { request: z.object({ url: z.string().url().max(2000) }), response: Ok }
} as const

/** Kanäle, auf denen der Main-Prozess an den Renderer sendet (kein invoke). */
export const PUSH_CHANNELS = ['worker:event', 'worker:status', 'chat:delta'] as const

export type IpcChannel = keyof typeof IPC_CHANNELS
export type IpcRequest<C extends IpcChannel> = z.infer<(typeof IPC_CHANNELS)[C]['request']>
export type IpcResponse<C extends IpcChannel> = z.infer<(typeof IPC_CHANNELS)[C]['response']>

export function isIpcChannel(value: unknown): value is IpcChannel {
  return typeof value === 'string' && Object.hasOwn(IPC_CHANNELS, value)
}
