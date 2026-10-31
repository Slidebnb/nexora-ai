import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Sprachmodus, einfach und lokal:
 * - Spracherkennung über die Web-Speech-API des Browsers (falls vorhanden). Hinweis: In manchen Umgebungen
 *   (auch Electron) sendet die Erkennung Audio an den Sprachdienst des Browsers oder ist gar nicht verfügbar.
 *   Dann gibt es eine ehrliche Meldung und man tippt weiter.
 * - Sprachausgabe über die System-Stimme (speechSynthesis), vollständig lokal.
 * Es wird nichts an NEXORA-fremde Dienste von uns aus gesendet; es fallen keine API-Kosten an.
 */
export interface Voice {
  sttSupported: boolean
  ttsSupported: boolean
  listening: boolean
  error: string | null
  start: () => void
  stop: () => void
  speak: (text: string) => void
}

function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort?: () => void
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'Kein Zugriff aufs Mikrofon. Bitte in den Systemeinstellungen erlauben.',
  'service-not-allowed': 'Kein Zugriff aufs Mikrofon. Bitte in den Systemeinstellungen erlauben.',
  'no-speech': 'Ich habe nichts gehört. Bitte erneut versuchen.',
  'network': 'Die Spracherkennung braucht hier eine Internetverbindung und ist gerade nicht erreichbar. Du kannst weiter tippen.',
  'audio-capture': 'Kein Mikrofon gefunden.'
}

export function useVoice(onFinal: (text: string) => void): Voice {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal
  const sttSupported = !!recognitionCtor()
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  const stop = useCallback(() => {
    try {
      recRef.current?.stop()
    } catch {
      /* egal */
    }
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const Ctor = recognitionCtor()
    if (!Ctor) {
      setError('Spracherkennung ist auf diesem System nicht verfügbar. Du kannst weiter tippen.')
      return
    }
    setError(null)
    try {
      const rec = new Ctor()
      rec.lang = 'de-DE'
      rec.interimResults = false
      rec.maxAlternatives = 1
      rec.continuous = false
      rec.onresult = (e) => {
        const text = e.results?.[0]?.[0]?.transcript?.trim()
        if (text) onFinalRef.current(text)
      }
      rec.onerror = (e) => {
        setError(ERRORS[e.error] ?? `Spracherkennung fehlgeschlagen (${e.error}).`)
        setListening(false)
      }
      rec.onend = () => setListening(false)
      recRef.current = rec
      rec.start()
      setListening(true)
    } catch {
      setError('Spracherkennung konnte nicht gestartet werden.')
      setListening(false)
    }
  }, [])

  const speak = useCallback(
    (text: string) => {
      if (!ttsSupported || !text) return
      try {
        window.speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(text)
        u.lang = 'de-DE'
        const voice = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('de'))
        if (voice) u.voice = voice
        window.speechSynthesis.speak(u)
      } catch {
        /* Sprachausgabe optional */
      }
    },
    [ttsSupported]
  )

  useEffect(
    () => () => {
      try {
        recRef.current?.abort?.()
      } catch {
        /* egal */
      }
      try {
        window.speechSynthesis?.cancel()
      } catch {
        /* egal */
      }
    },
    []
  )

  return { sttSupported, ttsSupported, listening, error, start, stop, speak }
}
