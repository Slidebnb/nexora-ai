import { join } from 'node:path'
import { app, BrowserWindow, Notification, session, shell } from 'electron'
import { buildCsp, isAllowedNavigation, secureWebPreferences } from './security'
import { createSecretStore, registerIpcHandlers } from './ipc'
import { LICENSE_PUBLIC_KEY_PEM, LicenseManager } from './license'
import { AppSettingsStore } from './appSettings'
import type { NexoraEvent } from '../shared/events'
import { WorkerHub } from './worker/hub'
import { resolveWorkerLaunch } from './worker/supervisor'

const devServerUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined

// Isoliertes Datenverzeichnis für automatisierte Tests (nur in der Entwicklungsversion).
const testUserData = !app.isPackaged ? process.env['NEXORA_USER_DATA'] : undefined
if (testUserData) app.setPath('userData', testUserData)

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#080B12',
    title: 'NEXORA AI',
    autoHideMenuBar: true,
    webPreferences: secureWebPreferences(join(__dirname, '../preload/index.js'))
  })

  win.once('ready-to-show', () => win.show())

  // Neue Fenster nie in der App öffnen; nur https-Links extern im Standardbrowser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, devServerUrl)) event.preventDefault()
  })
  win.webContents.on('will-attach-webview', (event) => event.preventDefault())

  if (devServerUrl) void win.loadURL(devServerUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  const csp = buildCsp(devServerUrl)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] }
    })
  })
  // Kamera, Mikrofon, Standort, Benachrichtigungen usw. sind standardmäßig verweigert.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)

  const secrets = createSecretStore()
  const settings = new AppSettingsStore(join(app.getPath('userData'), 'settings.json'))
  const hub = new WorkerHub(
    () =>
      resolveWorkerLaunch({
        packaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
        appPath: app.getAppPath(),
        dataDir: join(app.getPath('userData'), 'worker')
      }),
    secrets,
    (channel, payload) => broadcast(channel, payload)
  )

  function broadcast(channel: string, payload: unknown): void {
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload)
    if (channel === 'worker:event') notifyIfUnfocused(payload as NexoraEvent)
  }

  /** Windows-Benachrichtigung, wenn NEXORA im Hintergrund ist und der Nutzer gebraucht wird oder etwas fertig ist. */
  const runTitles = new Map<string, string>()
  function notifyIfUnfocused(e: NexoraEvent): void {
    if (e.type === 'run_created' && typeof e.payload['title'] === 'string') runTitles.set(e.runId, e.payload['title'])
    if (!settings.get().notifications || !Notification.isSupported()) return
    if (BrowserWindow.getAllWindows().some((w) => w.isFocused())) return
    const title = runTitles.get(e.runId) ?? 'NEXORA AI'
    const text = (k: string) => (typeof e.payload[k] === 'string' ? (e.payload[k] as string) : '')
    let body: string | null = null
    if (e.type === 'approval_requested') body = `Bitte bestätigen: ${text('action')}`
    else if (e.type === 'run_succeeded') body = `Fertig: ${text('summary') || text('verification')}`
    else if (e.type === 'run_failed') body = `Nicht geschafft: ${text('error')}`
    if (!body) return
    const n = new Notification({ title, body: body.slice(0, 200), silent: e.type !== 'approval_requested' })
    n.on('click', () => {
      const w = BrowserWindow.getAllWindows()[0]
      if (w) {
        if (w.isMinimized()) w.restore()
        w.focus()
      }
    })
    n.show()
  }
  const license = new LicenseManager({
    file: join(app.getPath('userData'), 'license.json'),
    publicKeyPem: LICENSE_PUBLIC_KEY_PEM,
    serverUrl: process.env['NEXORA_LICENSE_URL'] ?? 'https://license.nexora.example'
  })
  void license.refreshIfDue(secrets.get('license'))
  registerIpcHandlers({ devServerUrl, secrets, hub, license, settings, broadcast })
  createWindow()
  hub.start()

  let quitting = false
  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    void hub.stop().finally(() => app.quit())
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
