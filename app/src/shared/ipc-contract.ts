import { z } from 'zod'

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

export const IPC_CHANNELS = {
  'app:getInfo': { request: z.undefined(), response: AppInfoSchema },
  'secrets:status': { request: z.undefined(), response: SecretStatusSchema },
  'secrets:set': {
    request: z.object({ provider: ProviderSchema, key: ApiKeySchema }),
    response: SecretStatusSchema
  },
  'secrets:clear': { request: z.object({ provider: ProviderSchema }), response: SecretStatusSchema }
} as const

export type IpcChannel = keyof typeof IPC_CHANNELS
export type IpcRequest<C extends IpcChannel> = z.infer<(typeof IPC_CHANNELS)[C]['request']>
export type IpcResponse<C extends IpcChannel> = z.infer<(typeof IPC_CHANNELS)[C]['response']>

export function isIpcChannel(value: unknown): value is IpcChannel {
  return typeof value === 'string' && Object.hasOwn(IPC_CHANNELS, value)
}
