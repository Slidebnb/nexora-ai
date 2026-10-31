import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC_CHANNELS, type AppInfo } from '@shared/ipc-contract'
import { isAllowedNavigation } from './security'

function assertTrustedSender(event: IpcMainInvokeEvent, devServerUrl?: string): void {
  const url = event.senderFrame?.url
  if (!url || !isAllowedNavigation(url, devServerUrl)) {
    throw new Error('IPC von nicht vertrauenswürdigem Frame abgelehnt')
  }
}

export function registerIpcHandlers(devServerUrl?: string): void {
  ipcMain.handle('app:getInfo', (event, payload: unknown): AppInfo => {
    assertTrustedSender(event, devServerUrl)
    const spec = IPC_CHANNELS['app:getInfo']
    spec.request.parse(payload)
    return spec.response.parse({
      name: 'NEXORA AI',
      version: app.getVersion(),
      platform: process.platform
    })
  })
}
