/*
 * Verbindungen (Konnektoren über MCP): der Kunde fügt einen Dienst per Adresse hinzu, testet ihn und
 * sieht dessen Werkzeuge. Verändernde/sendende Aktionen laufen später nur über eine Freigabe (Workflow
 * connector_action). Das Token wird im sicheren Speicher des Betriebssystems gehalten, nie im Klartext.
 */
import { useCallback, useEffect, useState } from 'react'
import { Boxes, Calendar, FolderOpen, Link2, Mail, MessageSquare, Plug, RefreshCw, Trash2, Wrench } from 'lucide-react'
import type { Connector, ConnectorTool } from '@shared/ipc-contract'
import { useNexora } from '../../state/store'
import { cleanError } from '../../lib/actions'

interface Template {
  id: string
  name: string
  icon: typeof Mail
  desc: string
  urlPlaceholder: string
  hint: string
  needsToken: boolean
}

// Vorlagen für die Galerie. Ehrlich: Es gibt keine universelle Adresse je Dienst – jede Vorlage füllt die
// Maske vor und sagt, wo du die MCP-Adresse deines Dienstes bekommst. Kein automatisches „Fake-Verbinden“.
const CATALOG: Template[] = [
  { id: 'email', name: 'E-Mail', icon: Mail, desc: 'Gmail, Outlook u. a. über einen MCP-Dienst', urlPlaceholder: 'https://…/mcp', hint: 'Füge die MCP-Adresse deines E-Mail-Dienstes ein (vom Anbieter oder deinem selbst betriebenen MCP-Server). Meist mit Zugangstoken.', needsToken: true },
  { id: 'calendar', name: 'Kalender', icon: Calendar, desc: 'Google/Outlook-Kalender über MCP', urlPlaceholder: 'https://…/mcp', hint: 'Adresse des Kalender-MCP-Dienstes einfügen. Meist mit Zugangstoken.', needsToken: true },
  { id: 'files', name: 'Dateien / Cloud', icon: FolderOpen, desc: 'Drive, OneDrive u. a. über MCP', urlPlaceholder: 'https://…/mcp', hint: 'Adresse des Datei-/Cloud-MCP-Dienstes einfügen.', needsToken: true },
  { id: 'chat', name: 'Chat / Messaging', icon: MessageSquare, desc: 'Slack, Teams u. a. über MCP', urlPlaceholder: 'https://…/mcp', hint: 'Adresse des Chat-MCP-Dienstes einfügen.', needsToken: true },
  { id: 'custom', name: 'Eigener Dienst', icon: Boxes, desc: 'Beliebiger MCP-Server per Adresse', urlPlaceholder: 'https://…/mcp oder http://127.0.0.1:…/mcp', hint: 'Adresse eines beliebigen MCP-Servers. Lokale Server (127.0.0.1) dürfen http sein.', needsToken: false }
]

function AddForm({ onAdded, disabled, template }: { onAdded: () => void; disabled: boolean; template: Template | null }) {
  const [name, setName] = useState(template && template.id !== 'custom' ? template.name : '')
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="mt-3 grid gap-2 rounded-md border border-line p-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        try {
          await window.nexora.addConnector(name.trim(), url.trim(), token.trim() || undefined)
          setName('')
          setUrl('')
          setToken('')
          onAdded()
        } catch (err) {
          setError(cleanError(err))
        } finally {
          setBusy(false)
        }
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="input text-sm" placeholder="Name, z. B. „Mein Kalender“" aria-label="Name des Dienstes" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <input className="input text-sm" placeholder={template ? template.urlPlaceholder : 'Adresse (https://…/mcp)'} aria-label="Adresse des Dienstes" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={2000} />
      </div>
      <input className="input font-mono text-sm" type="password" autoComplete="off" placeholder="Zugangstoken (optional)" aria-label="Zugangstoken" value={token} onChange={(e) => setToken(e.target.value)} maxLength={4000} />
      {template && <p className="text-xs text-text-2">{template.hint}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-text-2">Für entfernte Dienste ist HTTPS nötig. Das Token wird verschlüsselt gespeichert.</p>
        <button type="submit" className="btn-primary" disabled={disabled || busy || !name.trim() || !url.trim()}>
          <Plug className="size-4" aria-hidden /> Hinzufügen
        </button>
      </div>
    </form>
  )
}

function ConnectorRow({ connector, onChanged, disabled }: { connector: Connector; onChanged: () => void; disabled: boolean }) {
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [tools, setTools] = useState<ConnectorTool[] | null>(null)
  const [busy, setBusy] = useState(false)

  const test = async () => {
    setBusy(true)
    try {
      setStatus(await window.nexora.testConnector(connector.id))
    } catch (e) {
      setStatus({ ok: false, message: cleanError(e) })
    } finally {
      setBusy(false)
    }
  }
  const showTools = async () => {
    setBusy(true)
    try {
      setTools(await window.nexora.connectorTools(connector.id))
    } catch (e) {
      setStatus({ ok: false, message: cleanError(e) })
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    setBusy(true)
    try {
      await window.nexora.removeConnector(connector.id)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="border-b border-line py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <Link2 className="size-4 text-text-2" aria-hidden />
        <span className="font-medium text-text">{connector.name}</span>
        <span className="truncate font-mono text-xs text-text-2" title={connector.url}>{connector.url}</span>
        {connector.hasToken && <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-text-2">Token</span>}
        <span className="ml-auto flex gap-1">
          <button type="button" className="btn-ghost text-xs" disabled={disabled || busy} onClick={() => void test()}>
            <RefreshCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden /> Testen
          </button>
          <button type="button" className="btn-ghost text-xs" disabled={disabled || busy} onClick={() => void showTools()}>
            <Wrench className="size-3.5" aria-hidden /> Werkzeuge
          </button>
          <button type="button" className="btn-ghost text-xs hover:text-danger" disabled={busy} onClick={() => void remove()} aria-label={`${connector.name} entfernen`}>
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </span>
      </div>
      {status && <p className={`mt-1.5 text-xs ${status.ok ? 'text-success' : 'text-warning'}`}>{status.message}</p>}
      {tools && (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {tools.length === 0 && <li className="text-xs text-text-2">Keine Werkzeuge.</li>}
          {tools.map((t) => (
            <li key={t.name} className="rounded border border-line px-2 py-0.5 text-xs text-text-2" title={t.description}>
              {t.name}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export function ConnectorsSection() {
  const worker = useNexora((s) => s.worker)
  const connected = worker.state === 'connected'
  const [list, setList] = useState<Connector[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pick, setPick] = useState<Template | null>(null)

  const load = useCallback(() => {
    if (!connected) return
    window.nexora.listConnectors().then(setList, (e: unknown) => setError(cleanError(e)))
  }, [connected])
  useEffect(() => load(), [load])

  return (
    <section className="panel p-5" aria-labelledby="connectors-title">
      <h2 id="connectors-title" className="hud-label">Verbindungen</h2>
      <p className="mt-2 text-sm text-text-2">
        Verbinde NEXORA mit deinen Diensten (über das offene MCP-Format, wie bei Claude). Danach kann NEXORA deren
        Werkzeuge nutzen. Bevor etwas verändert oder gesendet wird, fragt NEXORA dich einzeln.
      </p>
      {!connected && <p className="mt-3 text-sm text-warning">NEXORA startet noch – Verbindungen erscheinen, sobald der Hintergrunddienst bereit ist.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      {connected && (
        <>
          {list.length > 0 ? (
            <ul className="mt-3">
              {list.map((c) => (
                <ConnectorRow key={c.id} connector={c} onChanged={load} disabled={!connected} />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-text-2">Noch keine Verbindung. Wähle unten einen Dienst zum Verbinden.</p>
          )}

          <p className="mt-4 text-xs uppercase tracking-wider text-text-2/70">Dienst verbinden</p>
          <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2" aria-label="Verfügbare Dienste">
            {CATALOG.map((t) => {
              const Icon = t.icon
              const activeCard = pick?.id === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPick(t)}
                  className={`flex flex-col items-start gap-1.5 rounded-md border p-3 text-left transition-colors ${activeCard ? 'border-accent bg-accent/10' : 'border-line hover:border-accent/60 hover:bg-panel-2'}`}
                >
                  <Icon className="size-5 text-accent-hi" aria-hidden />
                  <span className="text-sm font-medium text-text">{t.name}</span>
                  <span className="text-[11px] text-text-2">{t.desc}</span>
                </button>
              )
            })}
          </div>
          {pick && <AddForm key={pick.id} onAdded={() => { load(); setPick(null) }} disabled={!connected} template={pick} />}
        </>
      )}
    </section>
  )
}
