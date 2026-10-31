import type { WebPreferences } from 'electron'

/** Gehärtete WebPreferences für jedes Fenster. Nicht lockern ohne ADR. */
export function secureWebPreferences(preloadPath: string): WebPreferences {
  return {
    preload: preloadPath,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    webviewTag: false,
    spellcheck: false
  }
}

/**
 * Content-Security-Policy. Im Dev-Modus braucht Vite HMR eine WebSocket-Verbindung
 * zum lokalen Dev-Server und Inline-Styles; im Produktionsbuild ist alles auf 'self' begrenzt.
 */
export function buildCsp(devServerUrl?: string): string {
  const connect = ["'self'"]
  const script = ["'self'"]
  if (devServerUrl) {
    const { host } = new URL(devServerUrl)
    connect.push(`ws://${host}`, `http://${host}`)
    script.push("'unsafe-inline'") // nur für das React-Refresh-Preamble im Dev-Server
  }
  return [
    "default-src 'self'",
    `script-src ${script.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; ')
}

/** Navigation ist nur zur eigenen App erlaubt (Dev-Server oder gebündelte file://-Seite). */
export function isAllowedNavigation(target: string, devServerUrl?: string): boolean {
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return false
  }
  if (devServerUrl) return url.origin === new URL(devServerUrl).origin
  return url.protocol === 'file:'
}
