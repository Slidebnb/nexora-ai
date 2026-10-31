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

export const IPC_CHANNELS = {
  'app:getInfo': { request: z.undefined(), response: AppInfoSchema }
} as const

export type IpcChannel = keyof typeof IPC_CHANNELS

export function isIpcChannel(value: unknown): value is IpcChannel {
  return typeof value === 'string' && Object.hasOwn(IPC_CHANNELS, value)
}
