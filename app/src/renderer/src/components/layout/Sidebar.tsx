import { Activity, Bot, FolderOpen, LayoutDashboard, Settings, Workflow } from 'lucide-react'
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
  const pending = useNexora((s) => selectPendingApprovals(s.data).length)

  return (
    <nav aria-label="Hauptnavigation" className="flex w-[76px] shrink-0 flex-col items-center gap-1 border-r border-line bg-base-2 py-4">
      <div className="mb-5 flex size-10 items-center justify-center rounded-full border border-accent/60 shadow-[0_0_18px_rgba(244,63,103,0.35)]">
        <span className="text-sm font-bold tracking-wider text-accent-hi">NX</span>
      </div>
      {NAV.map(({ id, label, icon: Icon }) => {
        const active = screen === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => setScreen(id)}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'relative flex w-16 flex-col items-center gap-1 rounded-md px-1 py-2 text-[10px] transition-colors',
              active ? 'bg-panel-2 text-text' : 'text-text-2 hover:bg-panel hover:text-text'
            )}
          >
            {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded bg-accent" aria-hidden />}
            <Icon className={cx('size-5', active && 'text-accent-hi')} aria-hidden />
            {label}
            {id === 'activity' && pending > 0 && (
              <span className="absolute right-2 top-1 min-w-4 rounded-full bg-warning px-1 text-[10px] font-bold text-base" aria-label={`${pending} offene Freigaben`}>
                {pending}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
