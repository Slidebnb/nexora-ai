import { useNexora } from '../state/store'
import { selectAgents } from '../state/selectors'
import { AgentCard } from '../components/agents/AgentCard'
import { EmptyState } from '../components/common/Panel'
import { ScreenHeader } from './ScreenHeader'

export function Agents() {
  const agents = selectAgents(useNexora((s) => s.data))
  return (
    <div className="h-full overflow-y-auto p-6">
      <ScreenHeader title="Agenten" subtitle="Jeder Agent zeigt seinen letzten Vorgang mit allen Schritten." />
      {agents.length === 0 ? (
        <EmptyState>Noch keine Agenten. Agenten entstehen mit dem ersten Vorgang.</EmptyState>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
          {agents.map((a) => (
            <AgentCard key={a.agentId} agent={a} detailed />
          ))}
        </div>
      )}
    </div>
  )
}
