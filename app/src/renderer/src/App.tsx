import { Sidebar } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { DemoBanner } from './components/layout/DemoBanner'
import { ApprovalCenter } from './components/approvals/ApprovalCenter'
import { useNexora, type Screen } from './state/store'
import { Dashboard } from './screens/Dashboard'
import { Agents } from './screens/Agents'
import { Automations } from './screens/Automations'
import { Activity } from './screens/Activity'
import { Files } from './screens/Files'
import { Settings } from './screens/Settings'

const SCREENS: Record<Screen, () => React.JSX.Element> = {
  dashboard: Dashboard,
  agents: Agents,
  automations: Automations,
  activity: Activity,
  files: Files,
  settings: Settings
}

export function App() {
  const screen = useNexora((s) => s.screen)
  const Current = SCREENS[screen]
  return (
    <div className="flex h-full bg-base text-text">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <DemoBanner />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Current />
        </main>
      </div>
      <ApprovalCenter />
    </div>
  )
}
