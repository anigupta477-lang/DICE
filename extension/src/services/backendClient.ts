import type {
  BackendJobResponse,
  GatekeeperApprovalRecord,
  PageReadResult,
  SavedClip,
} from '../types';

const BACKEND_BASE_URL = 'http://127.0.0.1:8000';

export interface StartResearchPayload {
  query: string;
  current_page?: {
    title: string;
    url: string;
    text: string;
  };
  tabs: Array<{ url: string; title: string }>;
  clips: Array<{ id: string; text: string; url: string; title: string }>;
}

export async function collectOpenHttpTabs(): Promise<
  Array<{ url: string; title: string }>
> {
  if (typeof chrome === 'undefined' || !chrome.tabs) return [];
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs
    .filter((t) => typeof t.url === 'string' && /^https?:\/\//i.test(t.url))
    .map((t) => ({
      url: t.url as string,
      title: t.title?.trim() || '',
    }));
}

export async function startResearchJob(
  query: string,
  pageResult: PageReadResult | null,
  clips: SavedClip[],
): Promise<{ job_id: string; status: string }> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new Error('Research query cannot be empty.');
  }

  const tabs = await collectOpenHttpTabs();
  const payload: StartResearchPayload = {
    query: normalizedQuery,
    tabs,
    clips: clips.map((c) => ({
      id: c.id,
      text: c.text,
      url: c.url,
      title: c.title,
    })),
    ...(pageResult
      ? {
          current_page: {
            title: pageResult.title,
            url: pageResult.url,
            text: pageResult.preview,
          },
        }
      : {}),
  };

  console.debug('[DICE][Backend] POST /api/research payload:', payload);

  let resp: Response;
  try {
    resp = await fetch(`${BACKEND_BASE_URL}/api/research`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      'Cannot reach DICE backend at http://127.0.0.1:8000. Start FastAPI with uvicorn and try again.',
    );
  }

  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`Backend error (${resp.status}): ${detail}`);
  }

  return (await resp.json()) as { job_id: string; status: string };
}

export async function getResearchJobStatus(
  jobId: string,
): Promise<BackendJobResponse> {
  const resp = await fetch(`${BACKEND_BASE_URL}/api/jobs/${encodeURIComponent(jobId)}`);
  if (!resp.ok) {
    throw new Error(`Failed to fetch job status (${resp.status}).`);
  }
  return (await resp.json()) as BackendJobResponse;
}

export async function triggerGatekeeperTest(): Promise<GatekeeperApprovalRecord> {
  let resp: Response;
  try {
    resp = await fetch(`${BACKEND_BASE_URL}/api/gatekeeper/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  } catch {
    throw new Error(
      'Cannot reach DICE backend at http://127.0.0.1:8000. Start FastAPI first.',
    );
  }
  if (!resp.ok) {
    throw new Error(`Gatekeeper test failed (${resp.status}).`);
  }
  return (await resp.json()) as GatekeeperApprovalRecord;
}

export async function sendGatekeeperDecision(
  gateId: string,
  approved: boolean,
): Promise<GatekeeperApprovalRecord> {
  const resp = await fetch(
    `${BACKEND_BASE_URL}/api/gatekeeper/${encodeURIComponent(gateId)}/decision`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved }),
    },
  );
  if (!resp.ok) {
    throw new Error(`Failed to send Gatekeeper decision (${resp.status}).`);
  }
  return (await resp.json()) as GatekeeperApprovalRecord;
}
