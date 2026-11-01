/*
 * Kosten-Transparenz (BYOK) für alles, was im Main-Prozess läuft: Chat und Voicestudio.
 * Aufgaben (Worker) melden ihre Kosten bereits über cost_updated-Ereignisse; hier kommt der Rest dazu.
 * Alle Beträge sind Schätzungen aus Token/Zeichen/Minuten – abgerechnet wird direkt vom Anbieter.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Provider } from '../shared/ipc-contract'

/** USD je 1 Mio. Token (Eingabe, Ausgabe). Unbekannte Cloud-Modelle: vorsichtig hoch geschätzt. */
const CHAT_PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [5, 25],
  'gpt-4o': [2.5, 10]
}
const CHAT_FALLBACK: [number, number] = [5, 25]
const TTS_USD_PER_CHAR = 15 / 1_000_000 // Sprachausgabe
const STT_USD_PER_MIN = 0.006 // Diktat (Whisper)

const round = (n: number): number => Math.round(n * 1e6) / 1e6

export function chatCostUsd(provider: Provider, model: string, inputTokens: number, outputTokens: number): number {
  if (provider === 'ollama') return 0 // läuft lokal, keine API-Kosten
  const [pin, pout] = CHAT_PRICES[model] ?? CHAT_FALLBACK
  return round((inputTokens / 1e6) * pin + (outputTokens / 1e6) * pout)
}

export const ttsCostUsd = (chars: number): number => round(Math.max(0, chars) * TTS_USD_PER_CHAR)
export const sttCostUsd = (durationMs: number): number => round((Math.max(0, durationMs) / 60_000) * STT_USD_PER_MIN)

export interface Usage {
  chatUsd: number
  voiceUsd: number
}

/** Kleiner, dauerhafter Zähler (userData/usage.json). Beschädigte Datei → bei 0 beginnen. */
export class UsageStore {
  private value: Usage = { chatUsd: 0, voiceUsd: 0 }

  constructor(private readonly file: string) {
    try {
      if (existsSync(file)) {
        const j = JSON.parse(readFileSync(file, 'utf8')) as Partial<Usage>
        const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
        this.value = { chatUsd: num(j.chatUsd), voiceUsd: num(j.voiceUsd) }
      }
    } catch {
      /* beschädigt → 0 */
    }
  }

  get(): Usage {
    return { ...this.value }
  }

  add(kind: 'chat' | 'voice', usd: number): Usage {
    if (!(usd > 0)) return this.get()
    const k = kind === 'chat' ? 'chatUsd' : 'voiceUsd'
    this.value[k] = round(this.value[k] + usd)
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.value), 'utf8')
    return this.get()
  }
}
