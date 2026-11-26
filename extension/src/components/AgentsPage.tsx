import { AGENTS } from '../data/agents';
import type { AgentId, AgentStatus, GatekeeperApprovalRecord } from '../types';
import { AgentIcon } from './Icons';

interface AgentsPageProps {
  agentStatuses: Record<AgentId, AgentStatus>;
  approvalRecord: GatekeeperApprovalRecord | null;
  busy: boolean;
  onTestGatekeeper: () => void;
  onGatekeeperDecision: (gateId: string, approved: boolean) => void;
}

export function AgentsPage({
  agentStatuses,
  approvalRecord,
  busy,
  onTestGatekeeper,
  onGatekeeperDecision,
}: AgentsPageProps) {
  return (
    <div className="page-stack">
      <div className="section-header" style={{ marginBottom: 0 }}>
        <h2 className="section-title">Agent Architecture &amp; Controls</h2>
        <span className="section-meta">6 modules</span>
      </div>

      <section className="card" aria-label="Gatekeeper Demonstration">
        <div className="section-header" style={{ marginBottom: 6 }}>
          <h3 className="section-title">Gatekeeper Safety Demo</h3>
          <span className="section-meta">Rule Engine</span>
        </div>
        <p className="page-intro" style={{ marginBottom: 10 }}>
          Simulate a controlled <code>EXTERNAL_POST</code> action to verify Gatekeeper interception and approval.
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={onTestGatekeeper}
        >
          Test Gatekeeper Approval
        </button>

        {approvalRecord && (
          <div className="gatekeeper-card" style={{ marginTop: 12 }} role="alert">
            <div className="section-header" style={{ marginBottom: 0 }}>
              <strong style={{ fontSize: 12.5 }}>
                {approvalRecord.action_type} · {approvalRecord.decision}
              </strong>
              <span
                className={`status-pill${
                  approvalRecord.status === 'APPROVED'
                    ? ' is-completed'
                    : approvalRecord.status === 'BLOCKED'
                      ? ' is-blocked'
                      : ' is-working'
                }`}
              >
                <span className="status-dot" />
                {approvalRecord.status}
              </span>
            </div>
            <p className="page-intro">{approvalRecord.reason}</p>
            <div className="gatekeeper-payload">
              <div>Target: {approvalRecord.target_url}</div>
              <div>{approvalRecord.payload_preview}</div>
            </div>
            {approvalRecord.status === 'PENDING_APPROVAL' && (
              <div className="confirm-banner-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => onGatekeeperDecision(approvalRecord.gate_id, true)}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="btn btn-danger-ghost"
                  disabled={busy}
                  onClick={() => onGatekeeperDecision(approvalRecord.gate_id, false)}
                >
                  Block
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="agent-detail-list">
        {AGENTS.map((agent) => {
          const status = agentStatuses[agent.id];
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
            <article key={agent.id} className="agent-detail-card">
              <div className="agent-detail-header">
                <div className="agent-detail-title-wrap">
                  <span className="agent-icon">
                    <AgentIcon id={agent.id} />
                  </span>
                  <h3 className="agent-detail-name">{agent.name}</h3>
                </div>
                <span className={`status-pill${statusClass}`}>
                  <span className="status-dot" />
                  {status}
                </span>
              </div>
              <p className="agent-detail-resp">{agent.responsibility}</p>
              <div className="agent-tech-row">
                <span className="agent-tech-label">Planned Technology</span>
                <span className="agent-tech-value">{agent.technology}</span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
