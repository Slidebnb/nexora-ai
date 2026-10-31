import { createHash, createPublicKey, randomUUID, verify } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { hostname, userInfo } from 'node:os'
import type { LicenseStatus } from '../shared/ipc-contract'

/**
 * Öffentlicher Schlüssel des Lizenzdienstes. Solange hier kein eigener Schlüssel eingetragen ist,
 * ist die Lizenzierung AUS (Entwicklungsversion). Erzeugen: im Ordner license-server
 * `uv run python -m nexora_license.signing` → PEM hier eintragen, privaten Schlüssel nur auf dem Server.
 */
export const LICENSE_PUBLIC_KEY_PEM = ''
export const TRIAL_DAYS = 14
export const ALL_FEATURES = ['workflows', 'schedules', 'cloud_ai'] as const
export type Feature = (typeof ALL_FEATURES)[number]

interface TokenPayload {
  v: number
  plan: string
  planName: string
  features: string[]
  machine: string
  iat: number
  exp: number
  hint: string
}

interface LicenseFile {
  installId: string
  firstRun: string
  token?: string
}

function b64uDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/** Prüft ein Ed25519-signiertes Token und gibt die Nutzlast zurück (oder null). */
export function verifyToken(token: string, publicKeyPem: string): TokenPayload | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  try {
    const ok = verify(null, Buffer.from(body), createPublicKey(publicKeyPem), b64uDecode(sig))
    if (!ok) return null
    const payload = JSON.parse(b64uDecode(body).toString('utf8')) as TokenPayload
    return payload.v === 1 && typeof payload.exp === 'number' ? payload : null
  } catch {
    return null
  }
}

export interface LicenseDeps {
  file: string
  publicKeyPem: string
  serverUrl: string
  now?: () => Date
  fetch?: typeof fetch
}

export class LicenseManager {
  private data: LicenseFile
  private readonly now: () => Date
  private readonly fetchFn: typeof fetch

  constructor(private readonly deps: LicenseDeps) {
    this.now = deps.now ?? (() => new Date())
    this.fetchFn = deps.fetch ?? fetch
    this.data = this.load()
  }

  private load(): LicenseFile {
    try {
      if (existsSync(this.deps.file)) {
        const d = JSON.parse(readFileSync(this.deps.file, 'utf8')) as Partial<LicenseFile>
        if (d.installId && d.firstRun) return d as LicenseFile
      }
    } catch {
      /* beschädigt → neu anlegen */
    }
    const fresh = { installId: randomUUID(), firstRun: this.now().toISOString() }
    this.save(fresh)
    return fresh
  }

  private save(d: LicenseFile): void {
    mkdirSync(dirname(this.deps.file), { recursive: true })
    writeFileSync(this.deps.file, JSON.stringify(d), { encoding: 'utf8', mode: 0o600 })
    this.data = d
  }

  /** Geräte-ID: stabil je Installation, ohne persönliche Daten im Klartext. */
  get machineId(): string {
    let user = ''
    try {
      user = userInfo().username
    } catch {
      /* ohne Benutzername */
    }
    return createHash('sha256').update(`${this.data.installId}|${hostname()}|${user}`).digest('hex').slice(0, 32)
  }

  get configured(): boolean {
    return this.deps.publicKeyPem.includes('BEGIN PUBLIC KEY')
  }

  status(): LicenseStatus {
    if (!this.configured) {
      return { state: 'unconfigured', features: [...ALL_FEATURES], message: 'Entwicklungsversion – Lizenzierung nicht konfiguriert' }
    }
    const now = this.now().getTime()
    if (this.data.token) {
      const p = verifyToken(this.data.token, this.deps.publicKeyPem)
      if (p && p.machine === this.machineId) {
        if (p.exp * 1000 > now) {
          return { state: 'active', plan: p.planName, features: p.features, expiresAt: new Date(p.exp * 1000).toISOString(), keyHint: p.hint }
        }
        return { state: 'expired', plan: p.planName, features: [], message: 'Lizenz konnte seit 14 Tagen nicht bestätigt werden – bitte mit dem Internet verbinden' }
      }
    }
    const trialEnds = new Date(new Date(this.data.firstRun).getTime() + TRIAL_DAYS * 86_400_000)
    if (trialEnds.getTime() > now) {
      return { state: 'trial', features: [...ALL_FEATURES], expiresAt: trialEnds.toISOString() }
    }
    return { state: 'trial_over', features: [], message: 'Testzeitraum beendet – bitte Lizenz aktivieren. Der Demo-Modus bleibt verfügbar.' }
  }

  has(feature: Feature): boolean {
    return this.status().features.includes(feature)
  }

  private async call(path: string, licenseKey: string): Promise<string> {
    const res = await this.fetchFn(`${this.deps.serverUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, machineId: this.machineId })
    })
    const body = (await res.json().catch(() => ({}))) as { token?: string; detail?: unknown }
    if (!res.ok || !body.token) throw new Error(typeof body.detail === 'string' ? body.detail : `Lizenzdienst: HTTP ${res.status}`)
    return body.token
  }

  async activate(licenseKey: string): Promise<LicenseStatus> {
    if (!this.configured) throw new Error('Lizenzierung ist in dieser Version nicht konfiguriert')
    const token = await this.call('/api/activate', licenseKey)
    if (!verifyToken(token, this.deps.publicKeyPem)) throw new Error('Antwort des Lizenzdienstes ist nicht gültig signiert')
    this.save({ ...this.data, token })
    return this.status()
  }

  /** Erneuert das Token, wenn es in weniger als 7 Tagen abläuft (benötigt den Schlüssel). */
  async refreshIfDue(licenseKey: string | undefined): Promise<void> {
    if (!this.configured || !licenseKey || !this.data.token) return
    const p = verifyToken(this.data.token, this.deps.publicKeyPem)
    if (p && p.exp * 1000 - this.now().getTime() > 7 * 86_400_000) return
    try {
      const token = await this.call('/api/refresh', licenseKey)
      if (verifyToken(token, this.deps.publicKeyPem)) this.save({ ...this.data, token })
    } catch {
      /* offline: Gnadenfrist läuft weiter */
    }
  }

  clear(): void {
    const { token: _t, ...rest } = this.data
    this.save(rest)
  }
}
