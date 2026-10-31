import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LicenseManager, verifyToken } from '../src/main/license'

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString()
const b64u = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function token(payload: Record<string, unknown>, key = privateKey): string {
  const body = b64u(Buffer.from(JSON.stringify(payload)))
  return `${body}.${b64u(sign(null, Buffer.from(body), key))}`
}

function manager(now: Date, fetchImpl?: typeof fetch, pem = PEM) {
  const file = join(mkdtempSync(join(tmpdir(), 'nx-lic-')), 'license.json')
  return new LicenseManager({ file, publicKeyPem: pem, serverUrl: 'https://lic.test', now: () => now, fetch: fetchImpl })
}

const day = 86_400_000
const t0 = new Date('2026-10-31T10:00:00Z')

describe('Lizenz', () => {
  it('ohne konfigurierten Schlüssel: Entwicklungsversion mit allen Funktionen (keine Selbstsperre)', () => {
    const m = manager(t0, undefined, '')
    expect(m.status()).toMatchObject({ state: 'unconfigured' })
    expect(m.has('workflows')).toBe(true)
  })

  it('Testzeitraum 14 Tage, danach nur Demo', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'nx-lic-')), 'license.json')
    let now = t0
    const m = new LicenseManager({ file, publicKeyPem: PEM, serverUrl: 'x', now: () => now })
    expect(m.status().state).toBe('trial')
    now = new Date(t0.getTime() + 15 * day)
    const later = new LicenseManager({ file, publicKeyPem: PEM, serverUrl: 'x', now: () => now })
    expect(later.status().state).toBe('trial_over')
    expect(later.has('workflows')).toBe(false)
  })

  it('aktiviert mit signiertem Token, prüft Gerät und Ablauf offline', async () => {
    let now = t0
    let machine = ''
    const fake = (async (_url: string, init: RequestInit) => {
      machine = JSON.parse(String(init.body)).machineId
      const t = token({ v: 1, plan: 'pro', planName: 'Pro', features: ['workflows', 'schedules'], machine, iat: 0, exp: Math.floor((now.getTime() + 14 * day) / 1000), hint: 'ABCDE' })
      return new Response(JSON.stringify({ token: t }), { status: 200 })
    }) as unknown as typeof fetch
    const file = join(mkdtempSync(join(tmpdir(), 'nx-lic-')), 'license.json')
    const m = new LicenseManager({ file, publicKeyPem: PEM, serverUrl: 'x', now: () => now, fetch: fake })
    const s = await m.activate('NXR-AAAAA-BBBBB-CCCCC-DDDDD')
    expect(s).toMatchObject({ state: 'active', plan: 'Pro', keyHint: 'ABCDE' })
    expect(m.has('schedules')).toBe(true)
    expect(m.has('cloud_ai')).toBe(false)
    now = new Date(t0.getTime() + 15 * day)
    expect(m.status().state).toBe('expired')
  })

  it('lehnt gefälschte oder fremde Token ab', async () => {
    const other = generateKeyPairSync('ed25519').privateKey
    const forged = (async () => new Response(JSON.stringify({ token: token({ v: 1, plan: 'pro', planName: 'Pro', features: [], machine: 'x', iat: 0, exp: 9e9, hint: 'X' }, other) }), { status: 200 })) as unknown as typeof fetch
    await expect(manager(t0, forged).activate('NXR-AAAAA-BBBBB-CCCCC-DDDDD')).rejects.toThrow(/nicht gültig signiert/)
    expect(verifyToken('kaputt', PEM)).toBeNull()
    const tampered = token({ v: 1, plan: 'starter', planName: 'Starter', features: [], machine: 'x', iat: 0, exp: 9e9, hint: 'X' })
    const [, sig] = tampered.split('.')
    const fakeBody = b64u(Buffer.from(JSON.stringify({ v: 1, plan: 'teams', planName: 'Teams', features: ['schedules'], machine: 'x', iat: 0, exp: 9e9, hint: 'X' })))
    expect(verifyToken(`${fakeBody}.${sig}`, PEM)).toBeNull()
  })

  it('meldet Fehler des Lizenzdienstes verständlich', async () => {
    const seats = (async () => new Response(JSON.stringify({ detail: 'Maximale Anzahl Geräte erreicht (1).' }), { status: 409 })) as unknown as typeof fetch
    await expect(manager(t0, seats).activate('NXR-AAAAA-BBBBB-CCCCC-DDDDD')).rejects.toThrow(/Maximale Anzahl Geräte/)
  })
})
