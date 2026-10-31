/*
 * Aufbau (einklappbare Seitenleiste mit Systemstatus-Box) nach
 * raheem-dotgit/cyberpunk-dashboard @ 8ec7ec7 – app/page.tsx
 * Lizenz: MIT (laut README des Projekts; Nutzung mit Zustimmung laut Projektinhaber).
 * Änderungen für NEXORA: React/Vite statt Next.js, eigene Navigation (6 Bereiche),
 * Statusbox zeigt echten Worker-/Demo-Zustand statt statischem „SYSTEM ONLINE“,
 * Badge für offene Freigaben, Crimson-Tokens, Barrierefreiheit (aria-current, aria-expanded).
 */
import { Activity, Bot, ChevronRight, FolderOpen, LayoutDashboard, Settings, Workflow } from 'lucide-react'
import { useNexora, type Screen } from '../../state/store'
import { selectPendingApprovals } from '../../state/selectors'
import { cx } from '../../lib/format'

const NAV: { id: Screen; label: string; icon: typeof Bot }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'agents', label: 'Agenten', icon: Bot },
  { id: 'automations', label: 'Automationen', icon: Workflow },
  { id: 'activity', label: 'Aktivitäten', icon: Activity },
  { id: 'files', label: 'Dateien', icon: FolderOpen },
  { id: 'settings', label: 'Einstellungen', icon: Settings }
]

export function Sidebar() {
  const screen = useNexora((s) => s.screen)
  const setScreen = useNexora((s) => s.setScreen)
  const collapsed = useNexora((s) => s.sidebarCollapsed)
  const toggle = useNexora((s) => s.toggleSidebar)
  const demoMode = useNexora((s) => s.demoMode)
  const worker = useNexora((s) => s.worker)
  const pending = useNexora((s) => selectPendingApprovals(s.data).length)

  const online = worker.state === 'connected'
  return (
    <nav
      aria-label="Hauptnavigation"
      className={cx('flex shrink-0 flex-col border-r border-line bg-base-2 py-4 transition-[width] duration-200', collapsed ? 'w-[76px] items-center' : 'w-56 px-3')}
    >
      <div className={cx('mb-6 flex items-center', collapsed ? 'flex-col gap-3' : 'justify-between')}>
        <div className="flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-full border border-accent/60 shadow-[0_0_18px_rgba(244,63,103,0.35)]">
            <span className="text-sm font-bold tracking-wider text-accent-hi">NX</span>
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-bold tracking-wider text-accent-hi">NEXORA AI</p>
              <p className="text-[10px] text-text-2">v0.1 · Command Center</p>
            </div>
          )}
        </div>
        <button type="button" onClick={toggle} aria-expanded={!collapsed} className="rounded p-1 text-text-2 hover:text-accent-hi" title={collapsed ? 'Navigation ausklappen' : 'Navigation einklappen'}>
          <ChevronRight className={cx('size-4 transition-transform', !collapsed && 'rotate-180')} aria-hidden />
          <span className="sr-only">Navigation umschalten</span>
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = screen === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setScreen(id)}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              className={cx(
                'relative flex items-center rounded-md transition-colors',
                collapsed ? 'w-16 flex-col gap-1 px-1 py-2 text-[10px]' : 'gap-3 px-3 py-2.5 text-sm',
                active ? 'bg-panel-2 text-text' : 'text-text-2 hover:bg-panel hover:text-text'
              )}
            >
              {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded bg-accent" aria-hidden />}
              <Icon className={cx('size-5', active && 'text-accent-hi')} aria-hidden />
              <span>{label}</span>
              {id === 'activity' && pending > 0 && (
                <span className={cx('min-w-4 rounded-full bg-warning px-1 text-center text-[10px] font-bold text-base', collapsed ? 'absolute right-2 top-1' : 'ml-auto')} aria-label={`${pending} offene Freigaben`}>
                  {pending}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {!collapsed && (
        <div className="mt-auto rounded border border-line bg-panel p-3" role="status">
          <div className="mb-1.5 flex items-center gap-2">
            <span className={cx('size-2 rounded-full', online ? 'bg-success motion-safe:animate-pulse' : 'bg-text-2')} aria-hidden />
            <span className="text-xs text-text">{online ? 'Worker verbunden' : 'Worker nicht verbunden'}</span>
          </div>
          <p className="text-[11px] leading-4 text-text-2">
            Modus: {demoMode ? 'DEMO (simuliert)' : 'Live'}
            <br />
            Verarbeitung: lokal
          </p>
        </div>
      )}
    </nav>
  )
}
