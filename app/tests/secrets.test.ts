import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SecretStore, type SecretCipher } from '../src/main/secrets'
import { ApiKeySchema, IPC_CHANNELS } from '../src/shared/ipc-contract'

const fakeCipher = (available = true): SecretCipher => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from([...Buffer.from(s)].map((b) => b ^ 0x5a)),
  decryptString: (b) => Buffer.from([...b].map((x) => x ^ 0x5a)).toString()
})

const KEY = 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWX'

function store(available = true) {
  const file = join(mkdtempSync(join(tmpdir(), 'nexora-')), 'secrets.json')
  return { file, s: new SecretStore(file, fakeCipher(available)) }
}

describe('SecretStore', () => {
  it('speichert verschlüsselt, niemals im Klartext', () => {
    const { file, s } = store()
    const status = s.set('anthropic', KEY)
    expect(status.configured).toEqual({ anthropic: true, openai: false })
    expect(readFileSync(file, 'utf8')).not.toContain(KEY)
    expect(s.get('anthropic')).toBe(KEY)
  })

  it('verweigert das Speichern ohne OS-Verschlüsselung', () => {
    const { file, s } = store(false)
    expect(() => s.set('openai', KEY)).toThrow(/nicht verfügbar/)
    expect(() => readFileSync(file)).toThrow()
    expect(s.status().encryptionAvailable).toBe(false)
  })

  it('entfernt einen Schlüssel', () => {
    const { s } = store()
    s.set('openai', KEY)
    expect(s.clear('openai').configured['openai']).toBe(false)
    expect(s.get('openai')).toBeUndefined()
  })

  it('behandelt eine beschädigte Datei als leer', () => {
    const { file, s } = store()
    writeFileSync(file, '{kaputt')
    expect(s.status().configured).toEqual({ anthropic: false, openai: false })
  })

  it('Status-Antwort enthält keinen Schlüssel', () => {
    const { s } = store()
    const status = s.set('anthropic', KEY)
    expect(JSON.stringify(IPC_CHANNELS['secrets:set'].response.parse(status))).not.toContain(KEY)
  })
})

describe('ApiKeySchema', () => {
  it('akzeptiert typische Schlüssel und lehnt Unsinn ab', () => {
    expect(ApiKeySchema.safeParse(KEY).success).toBe(true)
    expect(ApiKeySchema.safeParse('kurz').success).toBe(false)
    expect(ApiKeySchema.safeParse('mit leerzeichen drin 1234567890').success).toBe(false)
  })

  it('lehnt unbekannte Provider ab', () => {
    expect(IPC_CHANNELS['secrets:set'].request.safeParse({ provider: 'evil', key: KEY }).success).toBe(false)
  })
})
