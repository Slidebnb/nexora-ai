/*
 * Bekannte E-Mail-Anbieter: Aus der E-Mail-Adresse erkennt NEXORA den Anbieter und füllt Server, Port und
 * Verschlüsselung selbst aus – der Kunde gibt nur Adresse und Passwort ein. Unbekannte Domains (z. B. die eigene
 * Firma) richtet man unter „Anderer Anbieter“ manuell ein.
 */
export type Security = 'ssl' | 'starttls' | 'none'

export interface EmailProvider {
  id: string
  label: string
  host: string
  port: number
  security: Security
  domains: string[]
  /** Kurzer Hinweis in Alltagssprache, z. B. zum App-Passwort. */
  hint: string
}

export const EMAIL_PROVIDERS: EmailProvider[] = [
  { id: 'gmail', label: 'Gmail', host: 'smtp.gmail.com', port: 465, security: 'ssl', domains: ['gmail.com', 'googlemail.com'], hint: 'Gmail verlangt ein „App-Passwort“ (in deinem Google-Konto unter Sicherheit erstellen) – nicht dein normales Passwort.' },
  { id: 'outlook', label: 'Outlook / Hotmail', host: 'smtp.office365.com', port: 587, security: 'starttls', domains: ['outlook.com', 'outlook.de', 'hotmail.com', 'hotmail.de', 'live.com', 'live.de', 'msn.com'], hint: 'Mit Zwei-Faktor-Anmeldung brauchst du ein „App-Kennwort“ aus deinem Microsoft-Konto.' },
  { id: 'web', label: 'WEB.DE', host: 'smtp.web.de', port: 587, security: 'starttls', domains: ['web.de'], hint: 'Bei WEB.DE einmalig in den Postfach-Einstellungen „Zugriff über externe Programme (POP3/IMAP)“ erlauben.' },
  { id: 'gmx', label: 'GMX', host: 'mail.gmx.net', port: 587, security: 'starttls', domains: ['gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch'], hint: 'Bei GMX einmalig in den Postfach-Einstellungen „Zugriff über externe Programme (POP3/IMAP)“ erlauben.' },
  { id: 'tonline', label: 'T-Online', host: 'securemail.t-online.de', port: 465, security: 'ssl', domains: ['t-online.de'], hint: 'T-Online nutzt ein eigenes „E-Mail-Passwort“ (im Telekom-Kundencenter festlegen), nicht das Login-Passwort.' },
  { id: 'icloud', label: 'iCloud', host: 'smtp.mail.me.com', port: 587, security: 'starttls', domains: ['icloud.com', 'me.com', 'mac.com'], hint: 'iCloud verlangt ein „app-spezifisches Passwort“ (unter appleid.apple.com erstellen).' }
]

/** Erkennt den Anbieter an der Domain der E-Mail-Adresse; null bei unbekannter oder unvollständiger Adresse. */
export function detectEmailProvider(email: string): EmailProvider | null {
  const domain = email.trim().toLowerCase().split('@')[1]
  if (!domain) return null
  return EMAIL_PROVIDERS.find((p) => p.domains.includes(domain)) ?? null
}
