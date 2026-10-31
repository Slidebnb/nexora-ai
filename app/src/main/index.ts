import { join } from 'node:path'
import { app, BrowserWindow, session, shell } from 'electron'
import { buildCsp, isAllowedNavigation, secureWebPreferences } from './security'
import { registerIpcHandlers } from './ipc'

const devServerUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined

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

  registerIpcHandlers(devServerUrl)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
