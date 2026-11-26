import { AGENTS } from '../data/agents';
import type { AgentId, AgentStatus } from '../types';
import { AgentStatusCard } from './AgentStatusCard';

interface AgentDashboardProps {
  agentStatuses: Record<AgentId, AgentStatus>;
}

export function AgentDashboard({ agentStatuses }: AgentDashboardProps) {
  const workingCount = Object.values(agentStatuses).filter((s) => s === 'Working').length;
  const completedCount = Object.values(agentStatuses).filter((s) => s === 'Completed').length;

  const metaText =
    workingCount > 0
      ? `${workingCount} working`
      : completedCount > 0
        ? `${completedCount} completed`
        : '6 agents · All idle';

  return (
    <section aria-labelledby="agents-preview-heading">
      <div className="section-header">
        <h2 id="agents-preview-heading" className="section-title">
          Agent Activity
        </h2>
        <span className="section-meta">{metaText}</span>
      </div>
      <div className="agent-grid">
        {AGENTS.map((agent) => (
          <AgentStatusCard
            key={agent.id}
            agent={agent}
            status={agentStatuses[agent.id]}
          />
        ))}
      </div>
    </section>
  );
}
