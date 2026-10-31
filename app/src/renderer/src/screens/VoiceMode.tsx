/*
 * Live-Sprachmodus: Vollbild, animierter Orb. Einmal auf „Sprechen“ tippen, dann frei reden –
 * NEXORA hört zu, antwortet laut und führt dabei Werkzeuge aus (über denselben Agenten wie der Chat),
 * danach hört es automatisch weiter zu (Freisprech-Schleife).
 * Hinweis: Die Spracherkennung nutzt die Web-Speech-API; ist sie nicht verfügbar, sagt NEXORA das ehrlich.
 * Echte Telefon-Latenz (OpenAI Realtime) ist ein späterer Ausbau; dies gibt schon die Rede-und-Handeln-Erfahrung.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Square, X } from 'lucide-react'
import type { ChatMessage } from '@shared/ipc-contract'
import { useVoice } from '../lib/useVoice'
import { cleanError } from '../lib/actions'

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

const PHASE_TEXT: Record<Phase, string> = {
  idle: 'Tippe auf das Mikrofon und sprich mit NEXORA.',
  listening: 'Ich höre zu … sprich jetzt.',
  thinking: 'Einen Moment …',
  speaking: 'NEXORA spricht …'
}

export function VoiceMode({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [userText, setUserText] = useState('')
  const [reply, setReply] = useState('')
  const [error, setError] = useState<string | null>(null)
  const history = useRef<ChatMessage[]>([])
  const active = useRef(true)
  const idCounter = useRef(0)

  const speak = useCallback((text: string, done: () => void) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) {
      done()
      return
    }
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'de-DE'
      const v = window.speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith('de'))
      if (v) u.voice = v
      u.onend = done
      u.onerror = done
      window.speechSynthesis.speak(u)
    } catch {
      done()
    }
  }, [])

  const listenRef = useRef<() => void>(() => {})

  const ask = useCallback(
    async (text: string) => {
      setUserText(text)
      setReply('')
      setPhase('thinking')
      const id = `voice-${++idCounter.current}`
      const msgs: ChatMessage[] = [...history.current, { role: 'user', content: text }]
      try {
        const res = await window.nexora.sendChat(id, msgs)
        if (!active.current) return
        history.current = [...msgs, { role: 'assistant', content: res.text }]
        setReply(res.text)
        setPhase('speaking')
        speak(res.text, () => {
          if (active.current) listenRef.current()
          else setPhase('idle')
        })
      } catch (e) {
        if (!active.current) return
        setError(cleanError(e))
        setPhase('idle')
      }
    },
    [speak]
  )

  const voice = useVoice((t) => {
    if (t.trim()) void ask(t)
  })

  const listen = useCallback(() => {
    setError(null)
    setPhase('listening')
    voice.start()
  }, [voice])
  listenRef.current = listen

  useEffect(() => {
    return () => {
      active.current = false
      voice.stop()
      try {
        window.speechSynthesis?.cancel()
      } catch {
        /* egal */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fehler aus der Spracherkennung übernehmen
  useEffect(() => {
    if (voice.error) {
      setError(voice.error)
      setPhase('idle')
    }
  }, [voice.error])

  const busy = phase === 'listening' || phase === 'speaking' || phase === 'thinking'
  const ring = phase === 'listening' ? 'animate-ping' : phase === 'speaking' ? 'animate-pulse' : ''

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-base/95 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Sprachmodus">
      <button type="button" className="btn-ghost absolute right-4 top-4" onClick={onClose} aria-label="Sprachmodus schließen">
        <X className="size-5" aria-hidden />
      </button>

      <div className="relative flex size-56 items-center justify-center" aria-hidden>
        <span className={`absolute inset-0 rounded-full bg-accent/20 ${ring}`} />
        <span className={`absolute inset-6 rounded-full bg-accent/30 ${phase === 'thinking' ? 'animate-spin' : ''}`} style={phase === 'thinking' ? { borderTop: '3px solid var(--color-accent-hi)', background: 'transparent' } : undefined} />
        <span className="absolute inset-12 rounded-full bg-accent/40" />
        <span className="relative flex size-20 items-center justify-center rounded-full bg-accent shadow-[0_0_40px_rgba(244,63,103,0.6)]">
          <Mic className="size-9 text-base" aria-hidden />
        </span>
      </div>

      <div className="min-h-[96px] max-w-xl px-6 text-center">
        <p className="text-sm text-text-2" aria-live="polite">
          {error ?? PHASE_TEXT[phase]}
        </p>
        {userText && <p className="mt-3 text-sm text-text-2">Du: „{userText}"</p>}
        {reply && <p className="mt-2 text-lg text-text">{reply}</p>}
        {!voice.sttSupported && <p className="mt-3 text-xs text-warning">Spracherkennung ist auf diesem System nicht verfügbar. Du kannst stattdessen im Chat schreiben.</p>}
      </div>

      {phase === 'idle' ? (
        <button type="button" className="btn-primary px-6 py-3 text-base" onClick={listen} disabled={!voice.sttSupported} data-testid="voice-start">
          <Mic className="size-5" aria-hidden /> Sprechen
        </button>
      ) : (
        <button
          type="button"
          className="btn-secondary px-6 py-3 text-base"
          onClick={() => {
            voice.stop()
            try {
              window.speechSynthesis?.cancel()
            } catch {
              /* egal */
            }
            setPhase('idle')
          }}
          disabled={!busy}
        >
          <Square className="size-5" aria-hidden /> Stopp
        </button>
      )}
    </div>
  )
}
