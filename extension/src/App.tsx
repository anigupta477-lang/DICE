import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AgentId,
  AgentStatus,
  BackendAgentStatus,
  BackendJobResponse,
  GatekeeperApprovalRecord,
  NavTab,
  PageReadResult,
  SavedClip,
  SavedWorkspace,
  ToastMessage,
} from './types';
import {
  deleteClipById,
  deleteWorkspaceById,
  getClips,
  getWorkspaces,
  subscribeStorageChanges,
} from './services/storage';
import {
  organizeCurrentWindowTabs,
  restoreWorkspace,
  saveAndCloseWorkspace,
  saveCurrentWorkspace,
} from './services/tabArchitect';
import { highlightLatestSelection, readCurrentPage, setFocusMode } from './services/morph';
import {
  getResearchJobStatus,
  sendGatekeeperDecision,
  startResearchJob,
  triggerGatekeeperTest,
} from './services/backendClient';
import { useVoiceSteering } from './hooks/useVoiceSteering';
import { Header } from './components/Header';
import { TopNavigation } from './components/TopNavigation';
import { ResearchInput } from './components/ResearchInput';
import { CurrentPageCard } from './components/CurrentPageCard';
import { AgentDashboard } from './components/AgentDashboard';
import { ResultsPanel } from './components/ResultsPanel';
import { WorkspacePage } from './components/WorkspacePage';
import { SavedClipsPage } from './components/SavedClipsPage';
import { AgentsPage } from './components/AgentsPage';
import { ToastNotification } from './components/ToastNotification';

const INITIAL_STATUSES: Record<AgentId, AgentStatus> = {
  'tab-architect': 'Idle',
  morph: 'Idle',
  'voice-steering': 'Idle',
  'scout-swarm': 'Idle',
  gatekeeper: 'Idle',
  synthesis: 'Idle',
};

function mapBackendStatus(s?: BackendAgentStatus): AgentStatus {
  switch (s) {
    case 'WORKING':
      return 'Working';
    case 'COMPLETED':
      return 'Completed';
    case 'ERROR':
      return 'Error';
    case 'BLOCKED':
      return 'Blocked';
    default:
      return 'Idle';
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('research');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [agentStatuses, setAgentStatuses] =
    useState<Record<AgentId, AgentStatus>>(INITIAL_STATUSES);
  const [pageResult, setPageResult] = useState<PageReadResult | null>(null);
  const [focusMode, setFocusModeState] = useState(false);
  const [workspaces, setWorkspaces] = useState<SavedWorkspace[]>([]);
  const [clips, setClips] = useState<SavedClip[]>([]);
  const [busy, setBusy] = useState(false);
  const [jobResult, setJobResult] = useState<BackendJobResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [approvalRecord, setApprovalRecord] =
    useState<GatekeeperApprovalRecord | null>(null);

  const timerRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);

  const showToast = useCallback(
    (text: string, variant: ToastMessage['variant'] = 'info') => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      setToast({ id: Date.now(), text, variant });
      timerRef.current = window.setTimeout(() => {
        setToast(null);
        timerRef.current = null;
      }, 4500);
    },
    [],
  );

  const dismissToast = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  }, []);

  const setAgentStatus = useCallback((id: AgentId, status: AgentStatus) => {
    setAgentStatuses((prev) => ({ ...prev, [id]: status }));
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setIsPolling(false);
  }, []);

  useEffect(() => {
    void getWorkspaces().then(setWorkspaces).catch(() => {});
    void getClips().then(setClips).catch(() => {});

    const unsubscribe = subscribeStorageChanges({
      onWorkspacesChange: setWorkspaces,
      onClipsChange: setClips,
    });

    const onMessage = (message: {
      type?: string;
      status?: AgentStatus;
      highlighted?: boolean;
      reason?: 'NO_PERMISSION' | 'UNSUPPORTED' | 'FAILED';
    }) => {
      if (message?.type === 'MORPH_STATUS' && message.status) {
        setAgentStatus('morph', message.status);
      } else if (message?.type === 'CLIP_SAVED') {
        if (message.highlighted) {
          showToast('Saved clip and highlighted passage on the page.');
        } else if (message.reason === 'NO_PERMISSION') {
          showToast(
            'Clip saved. Webpage highlighting requires site access — use Read Current Page to grant access.',
          );
        } else {
          showToast('Clip saved, but could not highlight the selection on this page.');
        }
      } else if (message?.type === 'CLIP_SAVE_ERROR') {
        showToast('Failed to save selected text.', 'error');
      }
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(onMessage);
    }

    return () => {
      unsubscribe();
      stopPolling();
      if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(onMessage);
      }
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [showToast, setAgentStatus, stopPolling]);

  const executeResearch = useCallback(
    async (rawQuery: string, waitForCompletion = false): Promise<string> => {
      const cleanQuery = rawQuery.trim();
      if (!cleanQuery) {
        showToast('Please enter a research query first.', 'error');
        return 'Error: Please provide a research query.';
      }

      setQuery(cleanQuery);
      stopPolling();
      setBusy(true);
      setAgentStatuses((prev) => ({
        ...prev,
        gatekeeper: 'Working',
        'scout-swarm': 'Idle',
        synthesis: 'Idle',
      }));

      try {
        const created = await startResearchJob(cleanQuery, pageResult, clips);
        setIsPolling(true);

        const applyJob = (job: BackendJobResponse) => {
          setJobResult(job);
          setAgentStatuses((prev) => ({
            ...prev,
            gatekeeper: mapBackendStatus(job.agent_statuses.gatekeeper),
            'scout-swarm': mapBackendStatus(job.agent_statuses.scout_swarm),
            synthesis: mapBackendStatus(job.agent_statuses.synthesis),
          }));
        };

        if (waitForCompletion) {
          for (let attempt = 0; attempt < 35; attempt += 1) {
            const job = await getResearchJobStatus(created.job_id);
            applyJob(job);
            if (job.status === 'COMPLETED') {
              setIsPolling(false);
              setBusy(false);
              showToast('Research synthesis completed.');
              const takeaways = job.synthesis?.takeaways?.slice(0, 3).join(' ') ?? '';
              return `${job.synthesis?.summary ?? 'Research completed.'} ${takeaways}`.trim();
            }
            if (job.status === 'ERROR') {
              setIsPolling(false);
              setBusy(false);
              const errMsg = job.error || 'Research job encountered an error.';
              showToast(errMsg, 'error');
              return `Research failed: ${errMsg}`;
            }
            await new Promise((r) => window.setTimeout(r, 800));
          }
          setIsPolling(false);
          setBusy(false);
          return 'Research is still running in the side panel.';
        }

        const pollOnce = async () => {
          try {
            const job = await getResearchJobStatus(created.job_id);
            applyJob(job);

            if (job.status === 'COMPLETED' || job.status === 'ERROR') {
              stopPolling();
              setBusy(false);
              if (job.status === 'COMPLETED') {
                showToast('Research synthesis completed.');
              } else {
                showToast(job.error || 'Research job encountered an error.', 'error');
              }
            }
          } catch (err) {
            stopPolling();
            setBusy(false);
            showToast(
              err instanceof Error ? err.message : 'Lost connection to backend.',
              'error',
            );
          }
        };

        await pollOnce();
        pollRef.current = window.setInterval(() => {
          void pollOnce();
        }, 800);
        return 'Research started.';
      } catch (error) {
        setBusy(false);
        setAgentStatus('gatekeeper', 'Idle');
        const msg = error instanceof Error ? error.message : 'Failed to start research.';
        showToast(msg, 'error');
        return `Error: ${msg}`;
      }
    },
    [pageResult, clips, showToast, stopPolling, setAgentStatus],
  );

  const handleTestGatekeeper = async () => {
    setBusy(true);
    setAgentStatus('gatekeeper', 'Working');
    try {
      const record = await triggerGatekeeperTest();
      setApprovalRecord(record);
      setAgentStatus('gatekeeper', 'Blocked');
      showToast('Gatekeeper intercepted EXTERNAL_POST and requires your approval.');
    } catch (error) {
      setAgentStatus('gatekeeper', 'Error');
      showToast(
        error instanceof Error ? error.message : 'Gatekeeper test failed.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleGatekeeperDecision = async (gateId: string, approved: boolean) => {
    setBusy(true);
    try {
      const updated = await sendGatekeeperDecision(gateId, approved);
      setApprovalRecord(updated);
      setAgentStatus('gatekeeper', approved ? 'Completed' : 'Blocked');
      showToast(
        approved
          ? 'Controlled demo action approved.'
          : 'Controlled demo action blocked by Gatekeeper.',
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to submit decision.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleReadPage = async (): Promise<string> => {
    setBusy(true);
    setAgentStatus('morph', 'Working');
    try {
      const result = await readCurrentPage();
      setPageResult(result);
      setAgentStatus('morph', 'Completed');
      showToast(`Read "${result.title}" (${result.wordCount} words).`);
      return `Page title: ${result.title}. URL: ${result.url}. Word count: ${result.wordCount}. Preview: ${result.preview}`;
    } catch (error) {
      setAgentStatus('morph', 'Idle');
      const msg = error instanceof Error ? error.message : 'Failed to read current page.';
      showToast(msg, 'error');
      return `Error: ${msg}`;
    } finally {
      setBusy(false);
    }
  };

  const handleSetFocusMode = async (next: boolean): Promise<string> => {
    setBusy(true);
    setAgentStatus('morph', 'Working');
    try {
      await setFocusMode(next);
      setFocusModeState(next);
      setAgentStatus('morph', 'Completed');
      const msg = next ? 'Focus Mode enabled on active page.' : 'Focus Mode disabled.';
      showToast(msg);
      return msg;
    } catch (error) {
      setAgentStatus('morph', 'Idle');
      const msg = error instanceof Error ? error.message : 'Failed to toggle Focus Mode.';
      showToast(msg, 'error');
      return `Error: ${msg}`;
    } finally {
      setBusy(false);
    }
  };

  const handleOrganizeTabs = async (): Promise<string> => {
    setBusy(true);
    setAgentStatus('tab-architect', 'Working');
    try {
      const result = await organizeCurrentWindowTabs();
      setAgentStatus('tab-architect', 'Completed');
      const msg = `Organized ${result.groupedTabsCount} tabs into ${result.groupsCreated.length} group(s): ${result.groupsCreated.join(', ')}.`;
      showToast(msg);
      return msg;
    } catch (error) {
      setAgentStatus('tab-architect', 'Idle');
      const msg = error instanceof Error ? error.message : 'Failed to organize tabs.';
      showToast(msg, 'error');
      return `Error: ${msg}`;
    } finally {
      setBusy(false);
    }
  };

  const handleHighlightSelectedText = async (): Promise<string> => {
    setBusy(true);
    setAgentStatus('morph', 'Working');
    try {
      const res = await highlightLatestSelection();
      if (res.emptySelection) {
        setAgentStatus('morph', 'Idle');
        const msg = 'Please select a paragraph on the webpage first.';
        showToast(msg, 'error');
        return msg;
      }
      if (!res.highlighted) {
        setAgentStatus('morph', 'Idle');
        const msg = 'Could not locate the selected text on the active webpage.';
        showToast(msg, 'error');
        return msg;
      }
      setAgentStatus('morph', 'Completed');
      const msg = `Highlighted selected text on "${res.tabTitle}".`;
      showToast(msg);
      return msg;
    } catch (error) {
      setAgentStatus('morph', 'Idle');
      const msg = error instanceof Error ? error.message : 'Failed to highlight selected text.';
      showToast(msg, 'error');
      return `Error: ${msg}`;
    } finally {
      setBusy(false);
    }
  };

  const voice = useVoiceSteering({
    getCurrentPage: handleReadPage,
    organizeTabs: handleOrganizeTabs,
    setFocusMode: handleSetFocusMode,
    startResearch: (q) => executeResearch(q, true),
    highlightSelectedText: handleHighlightSelectedText,
    onVoiceStatusChange: (s) => setAgentStatus('voice-steering', s),
  });

  const handleSaveWorkspace = async () => {
    setBusy(true);
    setAgentStatus('tab-architect', 'Working');
    try {
      const ws = await saveCurrentWorkspace();
      setWorkspaces(await getWorkspaces());
      setAgentStatus('tab-architect', 'Completed');
      showToast(`Saved "${ws.name}" (${ws.tabs.length} tabs).`);
    } catch (error) {
      setAgentStatus('tab-architect', 'Idle');
      showToast(
        error instanceof Error ? error.message : 'Failed to save workspace.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAndClose = async () => {
    setBusy(true);
    setAgentStatus('tab-architect', 'Working');
    try {
      const res = await saveAndCloseWorkspace();
      setWorkspaces(await getWorkspaces());
      setAgentStatus('tab-architect', 'Completed');
      showToast(
        `Saved "${res.workspace.name}" and closed ${res.closedCount} tab(s). Active tab kept open for DICE.`,
      );
    } catch (error) {
      setAgentStatus('tab-architect', 'Idle');
      showToast(
        error instanceof Error ? error.message : 'Failed to save and close workspace.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreWorkspace = async (workspace: SavedWorkspace) => {
    setBusy(true);
    setAgentStatus('tab-architect', 'Working');
    try {
      const res = await restoreWorkspace(workspace);
      setAgentStatus('tab-architect', 'Completed');
      showToast(
        `Restored "${workspace.name}": ${res.createdCount} opened, ${res.reusedCount} reused, ${res.restoredGroupsCount} group(s).`,
      );
    } catch (error) {
      setAgentStatus('tab-architect', 'Idle');
      showToast(
        error instanceof Error ? error.message : 'Failed to restore workspace.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteWorkspace = async (workspaceId: string) => {
    try {
      const next = await deleteWorkspaceById(workspaceId);
      setWorkspaces(next);
      showToast('Workspace deleted.');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to delete workspace.',
        'error',
      );
    }
  };

  const handleDeleteClip = async (clipId: string) => {
    try {
      const next = await deleteClipById(clipId);
      setClips(next);
      showToast('Clip deleted.');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to delete clip.',
        'error',
      );
    }
  };

  return (
    <div className="app-shell">
      <Header />
      <TopNavigation activeTab={activeTab} onSelectTab={setActiveTab} />

      <main className="main-content">
        {activeTab === 'research' && (
          <>
            <ResearchInput
              query={query}
              onQueryChange={setQuery}
              onStartResearch={() => void executeResearch(query, false)}
              voiceStatus={voice.voiceStatus}
              voiceMode={voice.voiceMode}
              isMuted={voice.isMuted}
              agentId={voice.agentId}
              voiceError={voice.voiceError}
              transcript={voice.transcript}
              onAgentIdChange={voice.setAgentId}
              onStartVoice={() => void voice.startVoice()}
              onStopVoice={() => void voice.stopVoice()}
              onToggleMute={voice.toggleMute}
            />
            <CurrentPageCard
              pageResult={pageResult}
              focusMode={focusMode}
              busy={busy}
              onReadPage={() => void handleReadPage()}
              onToggleFocusMode={() => void handleSetFocusMode(!focusMode)}
            />
            <AgentDashboard agentStatuses={agentStatuses} />
            <ResultsPanel job={jobResult} isPolling={isPolling} />
          </>
        )}

        {activeTab === 'workspace' && (
          <WorkspacePage
            workspaces={workspaces}
            busy={busy}
            onOrganizeTabs={() => void handleOrganizeTabs()}
            onSaveWorkspace={() => void handleSaveWorkspace()}
            onSaveAndClose={() => void handleSaveAndClose()}
            onRestoreWorkspace={(ws) => void handleRestoreWorkspace(ws)}
            onDeleteWorkspace={(id) => void handleDeleteWorkspace(id)}
          />
        )}

        {activeTab === 'clips' && (
          <SavedClipsPage
            clips={clips}
            onDeleteClip={(id) => void handleDeleteClip(id)}
          />
        )}

        {activeTab === 'agents' && (
          <AgentsPage
            agentStatuses={agentStatuses}
            approvalRecord={approvalRecord}
            busy={busy}
            onTestGatekeeper={() => void handleTestGatekeeper()}
            onGatekeeperDecision={(id, ok) => void handleGatekeeperDecision(id, ok)}
          />
        )}
      </main>

      <ToastNotification toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
