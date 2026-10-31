import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell, type IpcMainInvokeEvent } from 'electron'
import { IPC_CHANNELS, type IpcChannel, type IpcRequest, type IpcResponse } from '@shared/ipc-contract'
import { isAllowedNavigation } from './security'
import { SecretStore } from './secrets'
import type { WorkerHub } from './worker/hub'

function assertTrustedSender(event: IpcMainInvokeEvent, devServerUrl?: string): void {
  const url = event.senderFrame?.url
  if (!url || !isAllowedNavigation(url, devServerUrl)) {
    throw new Error('IPC von nicht vertrauenswürdigem Frame abgelehnt')
  }
}

export function createSecretStore(): SecretStore {
  return new SecretStore(join(app.getPath('userData'), 'secrets.json'), safeStorage)
}

export function registerIpcHandlers(opts: { devServerUrl?: string; secrets: SecretStore; hub: WorkerHub }): void {
  const { devServerUrl, secrets, hub } = opts
  /** Ordner, die der Nutzer im nativen Dialog gewählt hat. Der Renderer kennt nur die ID. */
  const pickedFolders = new Map<string, string>()
  /** Einzeln gewählte Dateien (nur über den nativen Dialog). */
  const pickedFiles = new Map<string, string>()

  /** Registriert einen Kanal aus der Allowlist mit Absender-, Anfrage- und Antwortprüfung. */
  function handle<C extends IpcChannel>(channel: C, fn: (req: IpcRequest<C>, event: IpcMainInvokeEvent) => IpcResponse<C> | Promise<IpcResponse<C>>): void {
    const spec = IPC_CHANNELS[channel]
    ipcMain.handle(channel, async (event, payload: unknown) => {
      assertTrustedSender(event, devServerUrl)
      const parsed = spec.request.safeParse(payload)
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Anfrage')
      return spec.response.parse(await fn(parsed.data as IpcRequest<C>, event))
    })
  }

  handle('app:getInfo', () => ({ name: 'NEXORA AI', version: app.getVersion(), platform: process.platform }))
  handle('secrets:status', () => secrets.status())
  handle('secrets:set', async ({ provider, key }) => {
    const status = secrets.set(provider, key)
    await hub.pushSecrets()
    return status
  })
  handle('secrets:clear', async ({ provider }) => {
    const status = secrets.clear(provider)
    await hub.pushSecrets()
    return status
  })

  handle('worker:status', () => hub.status)
  handle('worker:history', () => hub.history)

  handle('dialog:pickFolder', async (_req, event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = { title: 'Ordner für NEXORA auswählen', properties: ['openDirectory' as const] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const path = result.filePaths[0]
    if (result.canceled || !path) return null
    const folderId = randomUUID()
    pickedFolders.set(folderId, path)
    return { folderId, name: basename(path) || path, path }
  })

  handle('dialog:pickFiles', async ({ kind }, event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const filters = kind === 'pdf' ? [{ name: 'PDF-Dokumente', extensions: ['pdf'] }] : []
    const options = { title: 'Dateien für NEXORA auswählen', properties: ['openFile' as const, 'multiSelections' as const], filters }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled) return []
    return result.filePaths.slice(0, 20).map((path) => {
      const fileId = randomUUID()
      pickedFiles.set(fileId, path)
      return { fileId, name: basename(path), path }
    })
  })

  handle('tasks:create', async (req) => {
    switch (req.workflow) {
      case 'organize_folder': {
        const folder = pickedFolders.get(req.folderId)
        if (!folder) throw new Error('Bitte den Ordner erneut auswählen')
        return hub.createTask('organize_folder', { folder }, req.capabilities)
      }
      case 'undo_organize':
        return hub.createTask('undo_organize', { runId: req.runId }, req.capabilities)
      case 'web_research':
        return hub.createTask('web_research', { question: req.question, urls: req.urls }, req.capabilities)
      case 'pdf_analysis': {
        const files = req.fileIds.map((id) => pickedFiles.get(id))
        if (files.some((f) => !f)) throw new Error('Bitte die Dateien erneut auswählen')
        return hub.createTask('pdf_analysis', { files, useCloudAi: req.useCloudAi }, req.capabilities)
      }
    }
  })
  handle('tasks:cancel', async ({ taskId }) => {
    await hub.cancelTask(taskId)
    return { ok: true }
  })
  handle('approvals:respond', async ({ approvalId, decision }) => {
    await hub.respondApproval(approvalId, decision)
    return { ok: true }
  })
  handle('files:reveal', ({ artifactId }) => {
    const path = hub.artifactPath(artifactId)
    if (!path) return { ok: false }
    shell.showItemInFolder(path)
    return { ok: true }
  })
}
