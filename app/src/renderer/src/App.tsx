import { lazy, Suspense, useEffect } from 'react'
// Technisches Kontrollzentrum nur bei eingeschalteter Expertenansicht laden
const Dashboard = lazy(() => import('./screens/Dashboard').then((m) => ({ default: m.Dashboard })))
import { Sidebar } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { DemoBanner } from './components/layout/DemoBanner'
import { ApprovalCenter } from './components/approvals/ApprovalCenter'
import { Onboarding } from './components/onboarding/Onboarding'
import { useNexora, type Screen } from './state/store'
import { Chat } from './screens/Chat'
import { Agents } from './screens/Agents'
import { Automations } from './screens/Automations'
import { Activity } from './screens/Activity'
import { Files } from './screens/Files'
import { Settings } from './screens/Settings'

const SCREENS: Record<Screen, () => React.JSX.Element> = {
  dashboard: StartScreen,
  agents: Agents,
  automations: Automations,
  activity: Activity,
  files: Files,
  settings: Settings
}

/** Start: einfache Kundenansicht, technische Ansicht nur im Expertenmodus. */
function StartScreen() {
  return useNexora((s) => s.expertMode) ? (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  ) : (
    <Chat />
  )
}

export function App() {
  const screen = useNexora((s) => s.screen)
  const theme = useNexora((s) => s.settings?.theme ?? 'crimson')
  useEffect(() => {
    document.documentElement.dataset['theme'] = theme
  }, [theme])
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
      <Onboarding />
    </div>
  )
}
