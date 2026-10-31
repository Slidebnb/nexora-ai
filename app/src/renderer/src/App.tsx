import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/ipc-contract'

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.nexora
      .getAppInfo()
      .then(setInfo)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <main className="flex h-full flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-semibold tracking-[0.3em] text-accent-hi">NEXORA AI</h1>
      <p className="text-text-2">
        {error ? `Fehler: ${error}` : info ? `Version ${info.version} · ${info.platform}` : 'Lade …'}
      </p>
      <p className="rounded border border-panel-2 bg-panel px-3 py-1 text-sm text-text-2">
        Worker: nicht verbunden
      </p>
    </main>
  )
}
