import { join } from 'node:path'
import { app, ipcMain, safeStorage, type IpcMainInvokeEvent } from 'electron'
import { IPC_CHANNELS, type IpcChannel, type IpcRequest, type IpcResponse } from '@shared/ipc-contract'
import { isAllowedNavigation } from './security'
import { SecretStore } from './secrets'

function assertTrustedSender(event: IpcMainInvokeEvent, devServerUrl?: string): void {
  const url = event.senderFrame?.url
  if (!url || !isAllowedNavigation(url, devServerUrl)) {
    throw new Error('IPC von nicht vertrauenswürdigem Frame abgelehnt')
  }
}

export function registerIpcHandlers(devServerUrl?: string): void {
  const secrets = new SecretStore(join(app.getPath('userData'), 'secrets.json'), safeStorage)

  /** Registriert einen Kanal aus der Allowlist mit Absender-, Anfrage- und Antwortprüfung. */
  function handle<C extends IpcChannel>(channel: C, fn: (req: IpcRequest<C>) => IpcResponse<C>): void {
    const spec = IPC_CHANNELS[channel]
    ipcMain.handle(channel, (event, payload: unknown) => {
      assertTrustedSender(event, devServerUrl)
      const parsed = spec.request.safeParse(payload)
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Anfrage')
      return spec.response.parse(fn(parsed.data as IpcRequest<C>))
    })
  }

  handle('app:getInfo', () => ({ name: 'NEXORA AI', version: app.getVersion(), platform: process.platform }))
  handle('secrets:status', () => secrets.status())
  handle('secrets:set', ({ provider, key }) => secrets.set(provider, key))
  handle('secrets:clear', ({ provider }) => secrets.clear(provider))
}
