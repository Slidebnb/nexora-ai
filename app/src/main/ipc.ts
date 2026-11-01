import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell, type IpcMainInvokeEvent } from 'electron'
import { IPC_CHANNELS, type IpcChannel, type IpcRequest, type IpcResponse } from '@shared/ipc-contract'
import { isAllowedNavigation } from './security'
import { SecretStore } from './secrets'
import { DEFAULT_MODEL, runAgent, ChatError, type ChatMessage, type ToolResult } from './chat'
import type { WorkerHub } from './worker/hub'
import type { Feature, LicenseManager } from './license'
import { createPracticeFolder, type AppSettingsStore } from './appSettings'

function assertTrustedSender(event: IpcMainInvokeEvent, devServerUrl?: string): void {
  const url = event.senderFrame?.url
  if (!url || !isAllowedNavigation(url, devServerUrl)) {
    throw new Error('IPC von nicht vertrauenswürdigem Frame abgelehnt')
  }
}

export function createSecretStore(): SecretStore {
  return new SecretStore(join(app.getPath('userData'), 'secrets.json'), safeStorage)
}

export function registerIpcHandlers(opts: { devServerUrl?: string; secrets: SecretStore; hub: WorkerHub; license: LicenseManager; settings: AppSettingsStore; broadcast: (channel: string, payload: unknown) => void }): void {
  const { devServerUrl, secrets, hub, license, settings, broadcast } = opts

  const chats = new Map<string, AbortController>()
  // Nur Entwicklungsversion (E2E): Test-Schlüssel aus Umgebungsvariable, nie in der gepackten App.
  const envKey = (provider: 'anthropic' | 'openai'): string | undefined =>
    (!app.isPackaged && process.env[provider === 'anthropic' ? 'NEXORA_TEST_ANTHROPIC_KEY' : 'NEXORA_TEST_OPENAI_KEY']) || undefined
  const chatKey = (provider: 'anthropic' | 'openai'): string | undefined => secrets.get(provider) ?? envKey(provider)
  const activeProvider = (): 'anthropic' | 'openai' | null => (chatKey('anthropic') ? 'anthropic' : chatKey('openai') ? 'openai' : null)

  /** Lizenzprüfung im Main-Prozess (der Renderer kann sie nicht umgehen). */
  function requireFeature(feature: Feature): void {
    if (license.has(feature)) return
    const s = license.status()
    const label = { workflows: 'Echte Aufgaben', schedules: 'Zeitpläne', cloud_ai: 'Cloud-KI' }[feature]
    throw new Error(`${label}: in deiner Lizenz nicht enthalten${s.message ? ` (${s.message})` : ''}`)
  }
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
    requireFeature('workflows')
    if (req.capabilities.includes('ai.cloud')) requireFeature('cloud_ai')
    switch (req.workflow) {
      case 'organize_folder': {
        const folder = pickedFolders.get(req.folderId)
        if (!folder) throw new Error('Bitte den Ordner erneut auswählen')
        return hub.createTask('organize_folder', { folder }, req.capabilities)
      }
      case 'undo_organize':
        return hub.createTask('undo_organize', { runId: req.runId }, req.capabilities)
      case 'web_research':
        return hub.createTask('web_research', { question: req.question, urls: req.urls, engine: req.useCloudAi ? 'browser_use' : 'direct' }, req.capabilities)
      case 'pdf_analysis': {
        const files = req.fileIds.map((id) => pickedFiles.get(id))
        if (files.some((f) => !f)) throw new Error('Bitte die Dateien erneut auswählen')
        return hub.createTask('pdf_analysis', { files, useCloudAi: req.useCloudAi, useOcr: req.useOcr }, req.capabilities)
      }
      case 'draft_emails': {
        const outFolder = pickedFolders.get(req.outFolderId)
        if (!outFolder) throw new Error('Bitte den Zielordner erneut auswählen')
        const { subject, briefing, recipients, useCloudAi } = req
        return hub.createTask('draft_emails', { subject, briefing, recipients, outFolder, useCloudAi }, req.capabilities)
      }
      case 'desktop_routine':
        return hub.createTask('desktop_routine', { window: req.window, steps: req.steps }, req.capabilities)
      case 'desktop_ai':
        return hub.createTask('desktop_ai', { window: req.window, goal: req.goal }, req.capabilities)
    }
  })
  handle('tasks:cancel', async ({ taskId }) => {
    await hub.cancelTask(taskId)
    return { ok: true }
  })
  handle('tasks:pause', async ({ taskId }) => {
    await hub.pauseTask(taskId)
    return { ok: true }
  })
  handle('tasks:resume', async ({ taskId }) => {
    await hub.resumeTask(taskId)
    return { ok: true }
  })
  handle('approvals:respond', async ({ approvalId, decision }) => {
    await hub.respondApproval(approvalId, decision)
    return { ok: true }
  })
  handle('system:status', async () => (await hub.systemStatus()) as IpcResponse<'system:status'>)
  handle('connectors:list', async () => (await hub.listConnectors()) as IpcResponse<'connectors:list'>)
  handle('connectors:add', async ({ name, url, token }) => {
    const connector = (await hub.addConnector(name, url, token ?? null)) as IpcResponse<'connectors:add'>
    // Token verschlüsselt ablegen, damit es bei jedem Start erneut an den lokalen Worker geht
    if (token) secrets.setConnectorToken(connector.id, token)
    return connector
  })
  handle('connectors:remove', async ({ id }) => {
    await hub.removeConnector(id)
    secrets.clearConnectorToken(id)
    return { ok: true }
  })
  handle('connectors:test', async ({ id }) => (await hub.testConnector(id)) as IpcResponse<'connectors:test'>)
  handle('connectors:tools', async ({ id }) => (await hub.connectorTools(id)) as IpcResponse<'connectors:tools'>)
  // E-Mail-Konto zum Senden (SMTP). Passwort bleibt im sicheren Speicher/Main-Prozess, nie im Renderer oder in der DB.
  const smtpStatus = (): IpcResponse<'email:get'> => {
    const c = secrets.getSmtp()
    if (!c) return null
    return {
      host: String(c['host'] ?? ''),
      port: Number(c['port'] ?? 0),
      security: (['ssl', 'starttls', 'none'].includes(String(c['security'])) ? c['security'] : 'starttls') as 'ssl' | 'starttls' | 'none',
      user: String(c['user'] ?? ''),
      fromAddr: String(c['fromAddr'] ?? '')
    }
  }
  handle('email:get', () => smtpStatus())
  handle('email:set', async (config) => {
    secrets.setSmtp(config)
    await hub.pushSecrets()
    return smtpStatus()
  })
  handle('email:clear', async () => {
    secrets.clearSmtp()
    await hub.pushSecrets()
    return smtpStatus()
  })
  handle('email:test', async () => {
    const c = secrets.getSmtp()
    if (!c) return { ok: false, message: 'Kein E-Mail-Konto hinterlegt.' }
    return (await hub.emailTest(c)) as IpcResponse<'email:test'>
  })
  handle('desktop:windows', async () => (await hub.desktopWindows()) as IpcResponse<'desktop:windows'>)
  handle('desktop:elements', async ({ window }) => (await hub.desktopElements(window)) as IpcResponse<'desktop:elements'>)
  handle('ai:test', async ({ provider }) => (await hub.testAi(provider)) as IpcResponse<'ai:test'>)
  handle('templates:list', async () => (await hub.listTemplates()) as IpcResponse<'templates:list'>)
  handle('templates:create', async ({ runId, name }) => (await hub.createTemplate(runId, name)) as IpcResponse<'templates:create'>)
  handle('templates:run', async ({ templateId, folderId, fileIds, outFolderId }) => {
    requireFeature('workflows')
    const overrides: Record<string, unknown> = {}
    if (folderId) {
      const folder = pickedFolders.get(folderId)
      if (!folder) throw new Error('Bitte den Ordner erneut auswählen')
      overrides['folder'] = folder
    }
    if (outFolderId) {
      const out = pickedFolders.get(outFolderId)
      if (!out) throw new Error('Bitte den Zielordner erneut auswählen')
      overrides['outFolder'] = out
    }
    if (fileIds?.length) {
      const files = fileIds.map((id) => pickedFiles.get(id))
      if (files.some((f) => !f)) throw new Error('Bitte die Dateien erneut auswählen')
      overrides['files'] = files
    }
    return hub.runTemplate(templateId, overrides)
  })
  handle('templates:schedule', async ({ templateId, schedule }) => {
    if (schedule) requireFeature('schedules')
    return (await hub.scheduleTemplate(templateId, schedule)) as IpcResponse<'templates:schedule'>
  })
  handle('settings:get', () => settings.get())
  handle('settings:update', (patch) => settings.update(patch))
  handle('onboarding:practiceFolder', () => {
    // Testumgebung darf einen eigenen Basisordner setzen (nur Entwicklungsversion)
    const base = (!app.isPackaged && process.env['NEXORA_PRACTICE_DIR']) || app.getPath('documents')
    const path = createPracticeFolder(base)
    const folderId = randomUUID()
    pickedFolders.set(folderId, path)
    return { folderId, name: basename(path), path }
  })
  handle('license:status', () => license.status())
  handle('license:activate', async ({ licenseKey }) => {
    const status = await license.activate(licenseKey.toUpperCase())
    secrets.set('license', licenseKey.toUpperCase())
    return status
  })
  handle('license:clear', () => {
    license.clear()
    secrets.clear('license')
    return license.status()
  })
  handle('templates:delete', async ({ templateId }) => {
    await hub.deleteTemplate(templateId)
    return { ok: true }
  })

  handle('chat:provider', () => {
    const provider = activeProvider()
    return { provider, model: provider ? DEFAULT_MODEL[provider] : null }
  })
  handle('chat:send', async ({ id, messages }, event) => {
    const provider = activeProvider()
    if (!provider) throw new Error('Kein KI-Schlüssel hinterlegt. Bitte unter Einstellungen einen Anthropic- oder OpenAI-Schlüssel eintragen.')
    requireFeature('cloud_ai')
    const key = chatKey(provider)!
    const model = DEFAULT_MODEL[provider]
    const controller = new AbortController()
    chats.get(id)?.abort()
    chats.set(id, controller)
    try {
      const exec = async (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
        if (name === 'web_recherche') {
          const frage = String(args['frage'] ?? '').trim()
          const urls = Array.isArray(args['urls']) ? (args['urls'] as unknown[]).map(String).filter((u) => /^https?:\/\//i.test(u)).slice(0, 10) : []
          if (frage.length < 3 || urls.length === 0) return { ok: false, summary: 'Frage oder Adressen fehlen', text: '' }
          try {
            return await hub.runToCompletion('web_research', { question: frage, urls, engine: 'direct' }, ['web.read', 'files.export'])
          } catch (err) {
            return { ok: false, summary: err instanceof Error ? err.message : 'Fehler', text: '' }
          }
        }
        if (name === 'email_entwurf') {
          const subject = String(args['betreff'] ?? '').trim()
          const briefing = String(args['text'] ?? '').trim()
          const emails = Array.isArray(args['empfaenger']) ? (args['empfaenger'] as unknown[]).map(String) : []
          const recipients = emails.filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)).map((email) => ({ name: '', email }))
          if (subject.length < 1 || briefing.length < 10 || recipients.length === 0) return { ok: false, summary: 'Betreff, Text (mind. 10 Zeichen) oder gültige Empfänger fehlen', text: '' }
          const base = (!app.isPackaged && process.env['NEXORA_PRACTICE_DIR']) || app.getPath('documents')
          const outFolder = join(base, 'NEXORA Entwürfe')
          try {
            mkdirSync(outFolder, { recursive: true })
            return await hub.runToCompletion('draft_emails', { subject, briefing, recipients, outFolder, useCloudAi: false }, ['drafts.write', 'files.write'])
          } catch (err) {
            return { ok: false, summary: err instanceof Error ? err.message : 'Fehler', text: '' }
          }
        }
        if (name === 'email_senden') {
          if (!secrets.getSmtp()) return { ok: false, summary: 'Kein E-Mail-Konto hinterlegt. Bitte unter Einstellungen ein E-Mail-Konto zum Senden einrichten.', text: '' }
          const subject = String(args['betreff'] ?? '').trim()
          const body = String(args['text'] ?? '').trim()
          const emails = Array.isArray(args['empfaenger']) ? (args['empfaenger'] as unknown[]).map(String) : []
          const recipients = emails.filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)).map((email) => ({ name: '', email }))
          if (subject.length < 1 || body.length < 1 || recipients.length === 0) return { ok: false, summary: 'Betreff, Text oder gültige Empfänger fehlen', text: '' }
          try {
            return await hub.runToCompletion('send_email', { subject, body, recipients }, ['email.send'])
          } catch (err) {
            return { ok: false, summary: err instanceof Error ? err.message : 'Fehler', text: '' }
          }
        }
        if (name === 'ordner_aufraeumen') {
          try {
            requireFeature('workflows')
          } catch (err) {
            return { ok: false, summary: err instanceof Error ? err.message : 'Fehler', text: '' }
          }
          const win = BrowserWindow.fromWebContents(event.sender)
          const options = { title: 'Ordner zum Aufräumen auswählen', properties: ['openDirectory' as const] }
          const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
          const folder = result.filePaths[0]
          if (result.canceled || !folder) return { ok: false, summary: 'Es wurde kein Ordner ausgewählt.', text: '' }
          try {
            return await hub.runToCompletion('organize_folder', { folder }, ['files.read', 'files.move'])
          } catch (err) {
            return { ok: false, summary: err instanceof Error ? err.message : 'Fehler', text: '' }
          }
        }
        if (name === 'pdf_lesen') {
          try {
            requireFeature('workflows')
          } catch (err) {
            return { ok: false, summary: err instanceof Error ? err.message : 'Fehler', text: '' }
          }
          const win = BrowserWindow.fromWebContents(event.sender)
          const options = { title: 'PDF-Dateien auswählen', properties: ['openFile' as const, 'multiSelections' as const], filters: [{ name: 'PDF-Dokumente', extensions: ['pdf'] }] }
          const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
          if (result.canceled || result.filePaths.length === 0) return { ok: false, summary: 'Es wurden keine Dateien ausgewählt.', text: '' }
          const files = result.filePaths.slice(0, 20)
          try {
            return await hub.runToCompletion('pdf_analysis', { files, useCloudAi: false, useOcr: false }, ['pdf.read', 'files.export'])
          } catch (err) {
            return { ok: false, summary: err instanceof Error ? err.message : 'Fehler', text: '' }
          }
        }
        if (name === 'konnektoren_auflisten') {
          try {
            const list = (await hub.listConnectors()) as { id: string; name: string }[]
            if (list.length === 0) return { ok: true, summary: 'Es sind keine Dienste verbunden.', text: '' }
            const lines: string[] = []
            for (const c of list) {
              let tools = ''
              try {
                const t = (await hub.connectorTools(c.id)) as { name: string }[]
                tools = t.map((x) => x.name).join(', ') || '(keine Werkzeuge)'
              } catch (e) {
                tools = `(nicht erreichbar: ${e instanceof Error ? e.message : 'Fehler'})`
              }
              lines.push(`- ${c.name} [connectorId: ${c.id}] → Werkzeuge: ${tools}`)
            }
            return { ok: true, summary: `${list.length} verbundene(r) Dienst(e)`, text: lines.join('\n') }
          } catch (err) {
            return { ok: false, summary: err instanceof Error ? err.message : 'Fehler', text: '' }
          }
        }
        if (name === 'konnektor_aufrufen') {
          const connectorId = String(args['connectorId'] ?? '')
          const tool = String(args['werkzeug'] ?? '')
          const argumente = (args['argumente'] && typeof args['argumente'] === 'object') ? (args['argumente'] as Record<string, unknown>) : {}
          if (!connectorId || !tool) return { ok: false, summary: 'connectorId oder Werkzeug fehlt', text: '' }
          try {
            return await hub.runToCompletion('connector_action', { connectorId, tool, arguments: argumente }, ['connectors.use'])
          } catch (err) {
            return { ok: false, summary: err instanceof Error ? err.message : 'Fehler', text: '' }
          }
        }
        return { ok: false, summary: `Unbekanntes Werkzeug: ${name}`, text: '' }
      }
      const text = await runAgent({
        provider,
        key,
        model,
        messages: messages as ChatMessage[],
        signal: controller.signal,
        onDelta: (delta) => broadcast('chat:delta', { id, delta }),
        onTool: (label) => broadcast('chat:delta', { id, step: label }),
        exec
      })
      return { text, model, provider }
    } catch (e) {
      if (controller.signal.aborted) return { text: '', model, provider }
      throw e instanceof ChatError ? new Error(e.message) : e
    } finally {
      chats.delete(id)
    }
  })
  handle('chat:cancel', ({ id }) => {
    chats.get(id)?.abort()
    chats.delete(id)
    return { ok: true }
  })

  handle('files:reveal', ({ artifactId }) => {
    const path = hub.artifactPath(artifactId)
    if (!path) return { ok: false }
    shell.showItemInFolder(path)
    return { ok: true }
  })

  // Nur bekannte Hilfe-/Anbieter-Seiten im echten Browser öffnen (feste Allowlist, nur https). Kein beliebiges Öffnen.
  const EXTERNAL_HOSTS = new Set(['console.anthropic.com', 'platform.openai.com', 'docs.anthropic.com', 'help.openai.com'])
  handle('shell:openExternal', async ({ url }) => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return { ok: false }
    }
    if (parsed.protocol !== 'https:' || !EXTERNAL_HOSTS.has(parsed.hostname)) return { ok: false }
    await shell.openExternal(parsed.toString())
    return { ok: true }
  })
}
