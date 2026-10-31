import { describe, expect, it } from 'vitest'
import { buildCsp, isAllowedNavigation, secureWebPreferences } from '../src/main/security'
import { isIpcChannel } from '../src/shared/ipc-contract'

describe('secureWebPreferences', () => {
  it('aktiviert Isolation und Sandbox und deaktiviert Node im Renderer', () => {
    const prefs = secureWebPreferences('/p/preload.js')
    expect(prefs).toMatchObject({
      preload: '/p/preload.js',
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false
    })
  })
})

describe('buildCsp', () => {
  it('erlaubt im Produktionsbuild nur eigene Skripte und Verbindungen', () => {
    const csp = buildCsp()
    expect(csp).toContain("script-src 'self';")
    expect(csp).toContain("connect-src 'self';")
    expect(csp).toContain("object-src 'none'")
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).toContain("frame-ancestors 'none'")
  })

  it('lässt frame-ancestors im Meta-Tag weg (würde dort nur eine Warnung erzeugen)', () => {
    expect(buildCsp(undefined, { forMeta: true })).not.toContain('frame-ancestors')
  })

  it('erlaubt im Dev-Modus nur den lokalen Dev-Server zusätzlich', () => {
    const csp = buildCsp('http://localhost:5173')
    expect(csp).toContain('ws://localhost:5173')
    expect(csp).not.toContain('unsafe-eval')
  })
})

describe('isAllowedNavigation', () => {
  it('erlaubt im Produktionsbuild nur file://', () => {
    expect(isAllowedNavigation('file:///C:/app/index.html')).toBe(true)
    expect(isAllowedNavigation('https://evil.example')).toBe(false)
    expect(isAllowedNavigation('kein url')).toBe(false)
  })

  it('erlaubt im Dev-Modus nur denselben Origin', () => {
    const dev = 'http://localhost:5173'
    expect(isAllowedNavigation('http://localhost:5173/#/agents', dev)).toBe(true)
    expect(isAllowedNavigation('http://localhost:9999/', dev)).toBe(false)
    expect(isAllowedNavigation('file:///x', dev)).toBe(false)
  })
})

describe('isIpcChannel', () => {
  it('akzeptiert nur Kanäle aus der Allowlist', () => {
    expect(isIpcChannel('app:getInfo')).toBe(true)
    expect(isIpcChannel('shell:exec')).toBe(false)
    expect(isIpcChannel('toString')).toBe(false)
    expect(isIpcChannel(42)).toBe(false)
  })
})
