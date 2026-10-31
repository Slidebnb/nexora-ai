import type { ComposerDraft } from '../state/store'

/**
 * Lokale, regelbasierte Zuordnung eines Satzes zu einer NEXORA-Aufgabe (Befehlszeile).
 * Bewusst ohne KI und ohne vorgefertigte „Antworten“: Es wird nur erkannt, welche
 * vorhandene Aufgabe passt, und das Formular vorausgefüllt. Ausgeführt wird erst nach
 * Erlaubnis und Freigaben im normalen Ablauf.
 */
export interface Intent {
  workflowId: 'ordner' | 'recherche' | 'pdf' | 'entwurf'
  prefill: Partial<ComposerDraft>
  /** Kurzer Satz, was erkannt wurde */
  reason: string
}

export type CommandResult = { kind: 'task'; intent: Intent } | { kind: 'repeat' } | { kind: 'unknown' }

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi
const MAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g

// \b funktioniert in JS nicht mit Umlauten – daher Wortgrenzen über Lookarounds
const W = (body: string) => new RegExp(`(?<![\\p{L}\\d])(?:${body})(?![\\p{L}\\d])`, 'giu')

const RULES: { id: Intent['workflowId']; words: RegExp }[] = [
  { id: 'ordner', words: W('ordner\\p{L}*|aufräum\\p{L}*|aufraeum\\p{L}*|sortier\\p{L}*|downloads?|desktop|ordnung|dateien') },
  { id: 'recherche', words: W('webseiten?|websites?|internet|recherch\\p{L}*|vergleich\\p{L}*|preise?|tarife?|anbieter|online') },
  { id: 'pdf', words: W('pdfs?|rechnung\\p{L}*|dokument\\p{L}*|vertr(?:ag|äge)\\p{L}*|zusammenfass\\p{L}*|auswert\\p{L}*|analys\\p{L}*|scans?') },
  { id: 'entwurf', words: W('e-?mails?|mails?|entw(?:urf|ürfe)\\p{L}*|anschreib\\p{L}*|antwort\\p{L}*|nachricht\\p{L}*') }
]

const REPEAT = W('wiederhol\\p{L}*|vorlage\\p{L}*|nochmal|erneut')

export const INTENT_LABEL: Record<Intent['workflowId'], string> = {
  ordner: 'Ordner aufräumen',
  recherche: 'Webseiten vergleichen',
  pdf: 'PDFs zusammenfassen',
  entwurf: 'E-Mail-Entwürfe schreiben'
}

export function parseCommand(input: string): CommandResult {
  const text = input.trim()
  if (text.length < 3) return { kind: 'unknown' }
  if (REPEAT.test(text)) {
    REPEAT.lastIndex = 0
    return { kind: 'repeat' }
  }

  const urls = [...new Set((text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?)]+$/, '')))]
  const mails = [...new Set(text.match(MAIL_RE) ?? [])]
  const withoutUrls = text.replace(URL_RE, ' ').replace(MAIL_RE, ' ')
  const score: Record<Intent['workflowId'], number> = { ordner: 0, recherche: 0, pdf: 0, entwurf: 0 }
  for (const r of RULES) score[r.id] = (withoutUrls.match(r.words) ?? []).length
  if (urls.length) score.recherche += 3
  if (mails.length) score.entwurf += 3

  const order: Intent['workflowId'][] = ['ordner', 'recherche', 'pdf', 'entwurf']
  const best = order.reduce((a, b) => (score[b] > score[a] ? b : a))
  if (score[best] === 0) return { kind: 'unknown' }

  const prefill: Partial<ComposerDraft> = {}
  const rest = withoutUrls.replace(/\s+/g, ' ').trim()
  if (best === 'recherche') {
    if (rest.length >= 3) prefill.question = rest.slice(0, 500)
    if (urls.length) prefill.urls = urls.slice(0, 10).join('\n')
  } else if (best === 'entwurf') {
    if (rest.length >= 3) prefill.briefing = rest.slice(0, 4000)
    if (mails.length) prefill.recipients = mails.join('\n')
  }
  const details = [urls.length ? `${urls.length} Adresse(n)` : '', mails.length ? `${mails.length} Empfänger` : ''].filter(Boolean).join(', ')
  return {
    kind: 'task',
    intent: { workflowId: best, prefill, reason: `Dafür passt „${INTENT_LABEL[best]}“${details ? ` – übernommen: ${details}` : ''}.` }
  }
}
