import { useNexora } from '../../state/store'
import { selectAgents } from '../../state/selectors'
import { EmptyState, Panel } from '../common/Panel'
import { AgentCard } from './AgentCard'

export function AgentsPanel() {
  const agents = selectAgents(useNexora((s) => s.data))
  return (
    <Panel title="Agenten" actions={<span className="font-mono text-[10px] text-text-2">{agents.length}</span>} bodyClassName="overflow-y-auto p-3">
      {agents.length === 0 ? (
        <EmptyState>Keine Agenten aktiv. Agenten erscheinen, sobald ein Vorgang gestartet wird.</EmptyState>
      ) : (
        <div className="grid gap-2">
          {agents.map((a) => (
            <AgentCard key={a.agentId} agent={a} />
          ))}
        </div>
      )}
    </Panel>
  )
}
