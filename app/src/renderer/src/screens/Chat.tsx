/*
 * Chat mit NEXORA – das Herzstück. Du schreibst, die KI antwortet live über deinen hinterlegten
 * Schlüssel (Anthropic oder OpenAI; automatisch gewählt). Der Schlüssel bleibt im Hauptprozess.
 * Aktionen auf dem PC (Ordner, Dateien …) folgen als nächster Schritt – dann jeweils mit Freigabe.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioLines, KeyRound, Loader2, Mic, Send, Sparkles, Square, Volume2, VolumeX } from 'lucide-react'
import type { ChatMessage, Provider } from '@shared/ipc-contract'
import { useNexora } from '../state/store'
import { TaskWizard } from '../components/home/TaskWizard'
import { WorkflowGallery } from '../components/home/WorkflowGallery'
import { AgentPulse } from '../components/home/AgentPulse'
import { RecipeGallery } from '../components/home/RecipeGallery'
import { TaskRuns } from '../components/home/TaskRuns'
import { useVoice } from '../lib/useVoice'
import { VoiceMode } from './VoiceMode'

interface Shown extends ChatMessage {
  pending?: boolean
  steps?: string[]
}

let counter = 0
const PROVIDER_LABEL: Record<Provider, string> = { anthropic: 'Claude (Anthropic)', openai: 'OpenAI', ollama: 'Lokales Modell (Ollama)' }

export function Chat() {
  const setScreen = useNexora((s) => s.setScreen)
  const [provider, setProvider] = useState<Provider | null>(null)
  const [checked, setChecked] = useState(false)
  const [messages, setMessages] = useState<Shown[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idRef = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const settings = useNexora((s) => s.settings)
  const voiceCloud = !!settings?.voice?.enabled
  const [speakReplies, setSpeakReplies] = useState(settings?.voice?.autoSpeak ?? true)
  const [voiceMode, setVoiceMode] = useState(false)
  const sendRef = useRef<(t: string, spoken: boolean) => void>(() => {})
  const voice = useVoice((t) => sendRef.current(t, true), { cloud: voiceCloud })

  const refreshProvider = useCallback(() => {
    window.nexora.getChatProvider().then((p) => {
      setProvider(p.provider)
      setChecked(true)
    }, () => setChecked(true))
  }, [])
  useEffect(() => refreshProvider(), [refreshProvider])

  // Live-Tippen: Deltas an die laufende Antwort anhängen
  useEffect(() => {
    return window.nexora.onChatDelta((d) => {
      if (d.id !== idRef.current) return
      setMessages((m) => {
        const copy = [...m]
        const last = copy[copy.length - 1]
        if (!last || last.role !== 'assistant') return copy
        if (d.step) {
          // Sichtbarer Agent-Schritt: als eigene „arbeitet …"-Karte sammeln (verschwindet nicht mit der Antwort).
          copy[copy.length - 1] = { ...last, steps: [...(last.steps ?? []), d.step], pending: true }
        } else if (d.delta) {
          copy[copy.length - 1] = { ...last, content: last.content + d.delta, pending: true }
        }
        return copy
      })
    })
  }, [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const send = async (raw?: string, spoken = false) => {
    const text = (raw ?? input).trim()
    if (!text || streaming) return
    setError(null)
    const history: ChatMessage[] = [...messages.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: text }]
    const id = `chat-${++counter}`
    idRef.current = id
    setMessages((m) => [...m, { role: 'user', content: text }, { role: 'assistant', content: '', pending: true }])
    setInput('')
    setStreaming(true)
    try {
      const res = await window.nexora.sendChat(id, history)
      setMessages((m) => {
        const copy = [...m]
        const last = copy[copy.length - 1]
        if (last && last.role === 'assistant') copy[copy.length - 1] = { role: 'assistant', content: res.text || last.content, steps: last.steps }
        return copy
      })
      if (spoken && speakReplies) voice.speak(res.text)
    } catch (e) {
      const msg = e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)
      setError(msg)
      setMessages((m) => m.filter((x) => !(x.role === 'assistant' && x.pending && !x.content)))
    } finally {
      setStreaming(false)
      idRef.current = null
      if (!provider) refreshProvider()
    }
  }

  sendRef.current = (t, spoken) => void send(t, spoken)

  const stop = () => {
    if (idRef.current) void window.nexora.cancelChat(idRef.current)
    setStreaming(false)
    setMessages((m) => m.map((x) => (x.pending ? { role: x.role, content: x.content, steps: x.steps } : x)))
  }

  if (checked && !provider) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <Sparkles className="size-10 text-accent-hi" aria-hidden />
        <h1 className="text-2xl font-semibold text-text">Willkommen bei NEXORA</h1>
        <p className="max-w-md text-text-2">
          Damit du mit NEXORA schreiben kannst, trage einmalig deinen KI-Schlüssel ein (Anthropic oder OpenAI).
          Danach antwortet NEXORA direkt hier.
        </p>
        <button type="button" className="btn-primary" onClick={() => setScreen('settings')}>
          <KeyRound className="size-4" aria-hidden /> Schlüssel eintragen
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col p-4">
      <header className="flex items-center gap-2 pb-3">
        <Sparkles className="size-5 text-accent-hi" aria-hidden />
        <h1 className="text-lg font-semibold text-text">NEXORA</h1>
        <button type="button" className="btn-secondary ml-auto text-xs" onClick={() => setVoiceMode(true)} aria-label="Live-Sprachmodus öffnen" data-testid="open-voice">
          <AudioLines className="size-4" aria-hidden /> Sprachmodus
        </button>
        {streaming ? <AgentPulse /> : provider && <span className="text-xs text-text-2">über {PROVIDER_LABEL[provider]}</span>}
      </header>
      {voiceMode && <VoiceMode onClose={() => setVoiceMode(false)} />}

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" aria-live="polite">
        {messages.length === 0 && (
          <div className="mt-10 text-center text-text-2">
            <p className="text-lg text-text">Wie kann ich dir helfen?</p>
            <p className="mt-1 text-sm">Sag einfach dein Ziel in einem Satz – NEXORA erledigt alle nötigen Schritte, auch mehrere nacheinander.</p>
            <div className="mt-5" data-testid="chat-examples">
              <RecipeGallery
                onPick={(prompt) => {
                  setInput(prompt)
                  inputRef.current?.focus()
                }}
              />
            </div>
            <p className="mt-6 text-xs uppercase tracking-wider text-text-2/70">Oder nutze eine fertige Aufgabe</p>
            <WorkflowGallery />
          </div>
        )}
        {messages.map((m, i) => {
          if (m.role === 'user') {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-accent/20 px-4 py-2.5 text-sm text-text">{m.content}</div>
              </div>
            )
          }
          const showBubble = m.content || m.pending
          return (
            <div key={i} className="flex flex-col items-start gap-1.5">
              {m.steps && m.steps.length > 0 && (
                <ul className="flex flex-col gap-1" aria-label="Was NEXORA gerade tut" data-testid="agent-steps">
                  {m.steps.map((s, si) => {
                    const active = !!m.pending && si === m.steps!.length - 1
                    return (
                      <li key={si} className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs text-text-2">
                        <Loader2 className={`size-3.5 shrink-0 text-accent-hi ${active ? 'motion-safe:animate-spin' : ''}`} aria-hidden />
                        <span>{s}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
              {showBubble && (
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-line bg-panel px-4 py-2.5 text-sm text-text">
                  {m.content || '…'}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-2 empty:hidden">
        <TaskRuns />
      </div>

      {error && (
        <p role="alert" className="mt-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          rows={1}
          maxLength={20000}
          placeholder="Schreib NEXORA eine Nachricht …"
          aria-label="Nachricht an NEXORA"
          className="input max-h-40 min-h-[48px] flex-1 resize-none text-sm"
        />
        {voice.ttsSupported && (
          <button type="button" className="btn-ghost" aria-pressed={speakReplies} aria-label={speakReplies ? 'Gesprochene Antworten ausschalten' : 'Gesprochene Antworten einschalten'} title={speakReplies ? 'Gesprochene Antworten aus' : 'Gesprochene Antworten an'} onClick={() => setSpeakReplies((v) => !v)}>
            {speakReplies ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
          </button>
        )}
        <button type="button" className={voice.listening ? 'btn-secondary' : 'btn-ghost'} aria-pressed={voice.listening} aria-label={voice.listening ? 'Zuhören beenden' : 'Sprechen'} title={voice.listening ? 'Zuhören beenden' : 'Sprechen'} onClick={() => (voice.listening ? voice.stop() : voice.start())} disabled={streaming}>
          <Mic className={`size-4 ${voice.listening ? 'text-accent-hi motion-safe:animate-pulse' : ''}`} aria-hidden />
        </button>
        {streaming ? (
          <button type="button" className="btn-secondary" onClick={stop} aria-label="Antwort stoppen">
            <Square className="size-4" aria-hidden /> Stopp
          </button>
        ) : (
          <button type="submit" className="btn-primary" disabled={!input.trim()} aria-label="Senden">
            <Send className="size-4" aria-hidden /> Senden
          </button>
        )}
      </form>
      {(voice.listening || voice.error) && (
        <p className={`mt-1 text-center text-xs ${voice.error ? 'text-warning' : 'text-text-2'}`} role={voice.error ? 'alert' : 'status'}>
          {voice.error ?? 'Ich höre zu … sprich jetzt.'}
        </p>
      )}
      <p className="mt-1.5 text-center text-[11px] text-text-2">
        NEXORA kann Fehler machen. Aktionen auf deinem PC (Ordner, Dateien …) folgen – dann jeweils mit deiner Freigabe.
      </p>
      <TaskWizard />
    </div>
  )
}
