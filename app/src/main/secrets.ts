import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { LICENSE_SECRET, PROVIDERS, type Provider, type SecretStatus } from '../shared/ipc-contract'

type SecretName = Provider | typeof LICENSE_SECRET
const NAMES: readonly SecretName[] = [...PROVIDERS, LICENSE_SECRET]

/** Abstraktion über Electron safeStorage (Windows: DPAPI), damit die Logik testbar ist. */
export interface SecretCipher {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(encrypted: Buffer): string
}

type StoredFile = Partial<Record<SecretName, string>> & Record<string, string | undefined>

/**
 * Speichert API-Schlüssel ausschließlich verschlüsselt. Ist keine OS-Verschlüsselung
 * verfügbar, wird das Speichern verweigert – niemals Klartext-Fallback.
 */
export class SecretStore {
  constructor(
    private readonly file: string,
    private readonly cipher: SecretCipher
  ) {}

  status(): SecretStatus {
    const data = this.read()
    return {
      encryptionAvailable: this.cipher.isEncryptionAvailable(),
      configured: Object.fromEntries(PROVIDERS.map((p) => [p, typeof data[p] === 'string'])) as Record<Provider, boolean>
    }
  }

  set(provider: SecretName, key: string): SecretStatus {
    if (!this.cipher.isEncryptionAvailable()) {
      throw new Error('Sichere Speicherung ist auf diesem System nicht verfügbar. Schlüssel wurde nicht gespeichert.')
    }
    const data = this.read()
    data[provider] = this.cipher.encryptString(key).toString('base64')
    this.write(data)
    return this.status()
  }

  clear(provider: SecretName): SecretStatus {
    const data = this.read()
    delete data[provider]
    this.write(data)
    return this.status()
  }

  /** Nur für den Main-Prozess (wird verschlüsselt gehalten und nur an den lokalen Worker weitergegeben). */
  get(provider: SecretName): string | undefined {
    const value = this.read()[provider]
    if (!value || !this.cipher.isEncryptionAvailable()) return undefined
    return this.cipher.decryptString(Buffer.from(value, 'base64'))
  }

  /** Konnektor-Token verschlüsselt ablegen (Schlüssel: connector:<id>). */
  setConnectorToken(id: string, token: string): void {
    if (!this.cipher.isEncryptionAvailable()) {
      throw new Error('Sichere Speicherung ist auf diesem System nicht verfügbar.')
    }
    const data = this.read()
    data[`connector:${id}`] = this.cipher.encryptString(token).toString('base64')
    this.write(data)
  }

  clearConnectorToken(id: string): void {
    const data = this.read()
    delete data[`connector:${id}`]
    this.write(data)
  }

  /** Alle Konnektor-Token entschlüsselt (nur Main-Prozess, zur Weitergabe an den lokalen Worker). */
  connectorTokens(): Record<string, string> {
    if (!this.cipher.isEncryptionAvailable()) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(this.read())) {
      if (k.startsWith('connector:') && typeof v === 'string') {
        try {
          out[k.slice('connector:'.length)] = this.cipher.decryptString(Buffer.from(v, 'base64'))
        } catch {
          /* beschädigt: überspringen */
        }
      }
    }
    return out
  }

  private read(): StoredFile {
    if (!existsSync(this.file)) return {}
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file, 'utf8'))
      if (!parsed || typeof parsed !== 'object') return {}
      const out: StoredFile = {}
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string' && ((NAMES as readonly string[]).includes(k) || k.startsWith('connector:'))) out[k] = v
      }
      return out
    } catch {
      return {} // beschädigte Datei: wie leer behandeln, nicht abstürzen
    }
  }

  private write(data: StoredFile): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 })
    renameSync(tmp, this.file)
  }
}
