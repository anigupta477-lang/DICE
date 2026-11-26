import type { AgentDefinition, AgentStatus } from '../types';
import { AgentIcon } from './Icons';

interface AgentStatusCardProps {
  agent: AgentDefinition;
  status: AgentStatus;
}

export function AgentStatusCard({ agent, status }: AgentStatusCardProps) {
  const statusClass =
    status === 'Working'
      ? ' is-working'
      : status === 'Completed'
        ? ' is-completed'
        : status === 'Error'
          ? ' is-error'
          : status === 'Blocked'
            ? ' is-blocked'
            : '';

  return (
    <div className="agent-card">
      <div className="agent-card-top">
        <div className="agent-identity">
          <span className="agent-icon">
            <AgentIcon id={agent.id} />
          </span>
          <span className="agent-name" title={agent.name}>
            {agent.name}
          </span>
        </div>
        <span className={`status-pill${statusClass}`}>
          <span className="status-dot" />
          {status}
        </span>
      </div>
      <p className="agent-desc">{agent.shortDescription}</p>
    </div>
  );
}
