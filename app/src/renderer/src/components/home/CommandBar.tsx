/*
 * Befehlszeile „Sag einfach, was du brauchst“.
 * Aufbau (Kopfzeile, Verlauf mit Absender/Zeit, Eingabe mit Prompt-Zeichen) portiert aus jenman
 * `CommandInterface.tsx` (MIT, Copyright (c) 2025 Shaik Davood, siehe THIRD_PARTY_NOTICES.md).
 * Geändert: kein JARVIS-Branding, keine vorgefertigten Antworten, kein Mikrofon; die Antworten
 * stammen aus der lokalen Erkennung (`lib/intent.ts`) und öffnen nur den normalen Assistenten.
 */
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Send } from 'lucide-react'
import { useNexora } from '../../state/store'
import { INTENT_LABEL, parseCommand, type Intent } from '../../lib/intent'

interface Entry {
  id: number
  sender: 'DU' | 'NEXORA'
  text: string
  at: Date
  intent?: Intent
  repeat?: boolean
}

let nextId = 1

export function CommandBar({ disabled }: { disabled: boolean }) {
  const [input, setInput] = useState('')
  const [log, setLog] = useState<Entry[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const openWizard = useNexora((s) => s.setWizard)
  const setComposer = useNexora((s) => s.setComposer)
  const setScreen = useNexora((s) => s.setScreen)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [log])

  const open = (intent: Intent) => {
    setComposer(intent.prefill)
    openWizard(intent.workflowId)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    const res = parseCommand(text)
    const now = new Date()
    const reply: Entry =
      res.kind === 'task'
        ? { id: nextId++, sender: 'NEXORA', text: res.intent.reason, at: now, intent: res.intent }
        : res.kind === 'repeat'
          ? { id: nextId++, sender: 'NEXORA', text: 'Gespeicherte Aufgaben findest du unter „Automationen“.', at: now, repeat: true }
          : {
              id: nextId++,
              sender: 'NEXORA',
              text: `Dafür habe ich noch keine passende Aufgabe. Ich kann: ${Object.values(INTENT_LABEL).join(', ')}.`,
              at: now
            }
    setLog((l) => [...l.slice(-8), { id: nextId++, sender: 'DU', text, at: now }, reply])
    setInput('')
    if (res.kind === 'task') open(res.intent)
  }

  return (
    <section className="panel flex flex-col" aria-label="Befehlszeile" data-testid="command-bar">
      {log.length > 0 && (
        <div ref={scrollRef} className="max-h-48 space-y-2 overflow-y-auto px-4 py-3" aria-live="polite">
          {log.map((e) => (
            <div key={e.id} className={`flex gap-3 ${e.sender === 'DU' ? 'flex-row-reverse' : ''}`}>
              <span className={`w-14 shrink-0 pt-0.5 text-center text-[10px] tracking-widest ${e.sender === 'NEXORA' ? 'text-accent-hi' : 'text-text-2'}`}>{e.sender}</span>
              <div className="flex max-w-[75%] flex-col gap-0.5">
                <span className="text-[10px] text-text-2/70">{e.at.toLocaleTimeString('de-DE')}</span>
                <div className={`rounded border px-3 py-2 text-sm ${e.sender === 'NEXORA' ? 'border-accent/30 bg-accent/5 text-text' : 'border-line bg-base-2 text-text'}`}>
                  {e.text}
                  {e.intent && (
                    <button type="button" className="btn-ghost -mb-1 ml-1 text-xs" onClick={() => open(e.intent!)}>
                      Öffnen <ArrowRight className="size-3.5" aria-hidden />
                    </button>
                  )}
                  {e.repeat && (
                    <button type="button" className="btn-ghost -mb-1 ml-1 text-xs" onClick={() => setScreen('automations')}>
                      Zu den Automationen <ArrowRight className="size-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={submit} className={`flex gap-2 px-3 py-3 ${log.length ? 'border-t border-line' : ''}`}>
        <div className="input flex flex-1 items-center gap-2 py-0">
          <span className="font-mono text-accent-hi" aria-hidden>
            {'>'}
          </span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={disabled}
            maxLength={2000}
            placeholder="Oder sag einfach, was du brauchst – z. B. „Räum meinen Download-Ordner auf“"
            aria-label="Was soll NEXORA erledigen?"
            className="flex-1 bg-transparent py-2.5 text-sm text-text outline-none placeholder:text-text-2/60"
          />
        </div>
        <button type="submit" className="btn-primary" disabled={disabled || !input.trim()}>
          Los <Send className="size-4" aria-hidden />
        </button>
      </form>
    </section>
  )
}
