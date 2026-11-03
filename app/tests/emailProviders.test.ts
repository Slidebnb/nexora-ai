import { describe, expect, it } from 'vitest'
import { detectEmailProvider, EMAIL_PROVIDERS } from '../src/renderer/src/lib/emailProviders'

describe('E-Mail-Anbieter automatisch erkennen', () => {
  it.each([
    ['anna@gmail.com', 'gmail'],
    ['anna@googlemail.com', 'gmail'],
    ['Bob@Outlook.de', 'outlook'],
    ['bob@hotmail.com', 'outlook'],
    ['bob@live.de', 'outlook'],
    ['c@web.de', 'web'],
    ['d@gmx.de', 'gmx'],
    ['d@gmx.net', 'gmx'],
    ['e@t-online.de', 'tonline'],
    ['f@icloud.com', 'icloud'],
    ['f@me.com', 'icloud']
  ])('%s → %s', (email, id) => {
    expect(detectEmailProvider(email)?.id).toBe(id)
  })

  it('eigene Firmen-Domain oder unvollständige Eingabe → kein Anbieter (manuell einrichten)', () => {
    expect(detectEmailProvider('chef@meine-firma.de')).toBeNull()
    expect(detectEmailProvider('anna@')).toBeNull()
    expect(detectEmailProvider('')).toBeNull()
  })

  it('jeder Anbieter hat vollständige, plausible Serverangaben', () => {
    for (const p of EMAIL_PROVIDERS) {
      expect(p.host).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/)
      expect([465, 587]).toContain(p.port)
      expect(p.security === 'ssl' ? 465 : 587).toBe(p.port)
    }
  })
})
