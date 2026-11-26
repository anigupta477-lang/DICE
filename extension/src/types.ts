export type NavTab = 'research' | 'workspace' | 'clips' | 'agents';

export type AgentId =
  | 'tab-architect'
  | 'morph'
  | 'voice-steering'
  | 'scout-swarm'
  | 'gatekeeper'
  | 'synthesis';

export type AgentStatus = 'Idle' | 'Working' | 'Completed' | 'Error' | 'Blocked';

export interface AgentDefinition {
  id: AgentId;
  name: string;
  shortDescription: string;
  responsibility: string;
  technology: string;
}

export type WorkspaceCategory =
  | 'AI & Research'
  | 'Development'
  | 'Documentation'
  | 'Shopping'
  | 'Education & Learning'
  | 'General Research';

export type TabGroupColor =
  | 'grey'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'pink'
  | 'purple'
  | 'cyan'
  | 'orange';

export interface SavedWorkspaceGroup {
  groupId?: number;
  name: string;
  color: TabGroupColor;
  createdAt: string;
  tabUrls: string[];
}

export interface SavedWorkspaceTab {
  url: string;
  title: string;
  groupName: string | null;
  groupColor: TabGroupColor | null;
}

export interface SavedWorkspace {
  id: string;
  name: string;
  createdAt: string;
  groups: SavedWorkspaceGroup[];
  tabs: SavedWorkspaceTab[];
}

export interface SavedClip {
  id: string;
  text: string;
  url: string;
  title: string;
  createdAt: string;
}

export interface PageReadResult {
  title: string;
  url: string;
  wordCount: number;
  preview: string;
  textLength: number;
  readAt: string;
}

export interface ToastMessage {
  id: number;
  text: string;
  variant?: 'info' | 'error';
}

export type BackendAgentStatus = 'IDLE' | 'WORKING' | 'COMPLETED' | 'ERROR' | 'BLOCKED';

export interface BackendSourceResult {
  source_id: string;
  title: string;
  url: string;
  content: string;
  status: 'COMPLETED' | 'ERROR';
  error?: string | null;
}

export interface BackendFinding {
  claim: string;
  explanation: string;
  source_ids: string[];
}

export interface BackendContradiction {
  topic: string;
  position_a: string;
  position_b: string;
  source_ids: string[];
}

export interface BackendSynthesisOutput {
  summary: string;
  findings: BackendFinding[];
  contradictions: BackendContradiction[];
  takeaways: string[];
}

export interface BackendExecutionEvent {
  timestamp: string;
  agent: string;
  status: BackendAgentStatus;
  message: string;
}

export interface BackendJobResponse {
  job_id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'ERROR';
  agent_statuses: Record<string, BackendAgentStatus>;
  events: BackendExecutionEvent[];
  sources: BackendSourceResult[];
  synthesis: BackendSynthesisOutput | null;
  error?: string | null;
}

export interface GatekeeperApprovalRecord {
  gate_id: string;
  action_type: string;
  decision: 'PERMIT' | 'REQUIRE_APPROVAL' | 'DENY';
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'BLOCKED';
  target_url: string;
  summary: string;
  payload_preview: string;
  reason: string;
  created_at: string;
  decided_at?: string | null;
}
