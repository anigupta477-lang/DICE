import type {
  SavedWorkspace,
  SavedWorkspaceGroup,
  SavedWorkspaceTab,
  TabGroupColor,
  WorkspaceCategory,
} from '../types';
import { getWorkspaces, saveWorkspaces } from './storage';

const GROUP_META_STORAGE_KEY = 'dice_group_metadata';

const CATEGORY_COLORS: Record<WorkspaceCategory, TabGroupColor> = {
  'AI & Research': 'purple',
  Development: 'blue',
  Documentation: 'cyan',
  Shopping: 'orange',
  'Education & Learning': 'yellow',
  'General Research': 'green',
};

const AI_DOMAINS = [
  'arxiv.org',
  'huggingface.co',
  'openreview.net',
  'scholar.google',
  'semanticscholar.org',
  'paperswithcode.com',
  'openai.com',
  'anthropic.com',
  'deepmind.google',
];

const DEV_DOMAINS = [
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'stackoverflow.com',
  'stackexchange.com',
  'npmjs.com',
  'pypi.org',
  'codepen.io',
  'codesandbox.io',
  'localhost',
  '127.0.0.1',
];

const DOC_DOMAINS = [
  'developer.chrome.com',
  'developer.mozilla.org',
  'docs.python.org',
  'react.dev',
  'reactjs.org',
  'typescriptlang.org',
  'vitejs.dev',
  'fastapi.tiangolo.com',
  'nodejs.org',
  'rust-lang.org',
];

const SHOPPING_DOMAINS = [
  'amazon.in',
  'amazon.com',
  'flipkart.com',
  'myntra.com',
  'ajio.com',
  'nykaa.com',
  'ebay.com',
  'walmart.com',
  'bestbuy.com',
  'target.com',
  'croma.com',
  'reliancedigital.in',
];

const EDUCATION_DOMAINS = [
  'coursera.org',
  'edx.org',
  'khanacademy.org',
  'udemy.com',
  'mit.edu',
  'ocw.mit.edu',
  'brilliant.org',
  'leetcode.com',
  'geeksforgeeks.org',
  'w3schools.com',
];

function assertTabsApi(): void {
  if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabGroups) {
    throw new Error('Chrome Tabs and TabGroups APIs are only available inside the Chrome extension.');
  }
}

export function isOrganizableUrl(url?: string): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.protocol}//${parsed.host}${pathname}${parsed.search}`.toLowerCase();
  } catch {
    return rawUrl.trim().replace(/\/+$/, '').toLowerCase();
  }
}

function extractSearchQuery(parsed: URL): string {
  const host = parsed.hostname.toLowerCase();
  if (
    host.includes('google.') ||
    host.includes('bing.com') ||
    host.includes('duckduckgo.com')
  ) {
    return (parsed.searchParams.get('q') ?? '').trim().toLowerCase();
  }
  return '';
}

export function classifyTab(
  url: string,
  title: string,
): { category: WorkspaceCategory; color: TabGroupColor } {
  let hostname = '';
  let pathname = '';
  let searchQuery = '';
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname.toLowerCase();
    pathname = parsed.pathname.toLowerCase();
    searchQuery = extractSearchQuery(parsed);
  } catch {
    hostname = '';
  }

  const combinedText = `${hostname} ${pathname} ${title} ${searchQuery}`.toLowerCase();

  if (
    SHOPPING_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`)) ||
    /\b(amazon|flipkart|myntra|ajio|nykaa|meesho|ebay|walmart|bestbuy|buy|price|discount|deal|cart|checkout|shop|shopping|order|product|shoes|sneakers|laptop|phone|iphone|watch|headphones|tv|shirt|jeans|dress|bag)\b/.test(
      combinedText,
    )
  ) {
    return { category: 'Shopping', color: CATEGORY_COLORS.Shopping };
  }

  if (
    AI_DOMAINS.some((d) => hostname.includes(d)) ||
    /\b(chatgpt|openai|anthropic|claude|gemini|perplexity|deepseek|huggingface|arxiv|machine learning|deep learning|neural network|llm|transformer|research paper|artificial intelligence|ai research|ai agents|research|paper|journal|study)\b/.test(
      combinedText,
    )
  ) {
    return { category: 'AI & Research', color: CATEGORY_COLORS['AI & Research'] };
  }

  if (
    DEV_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`)) ||
    /\b(github|gitlab|stackoverflow|pull request|repository|repo|coding|programming|developer|typescript|javascript|python|java|c\+\+|html|css|docker|kubernetes|vite|react|node|git|debug|npm|code|bug|error|api)\b/.test(
      combinedText,
    )
  ) {
    return { category: 'Development', color: CATEGORY_COLORS.Development };
  }

  if (
    DOC_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`)) ||
    hostname.startsWith('docs.') ||
    pathname.startsWith('/docs') ||
    pathname.includes('/documentation') ||
    /\b(documentation|api reference|reference manual|developer guide|manual|sdk|docs|mdn|reference|specification|syntax)\b/.test(
      combinedText,
    )
  ) {
    return { category: 'Documentation', color: CATEGORY_COLORS.Documentation };
  }

  if (
    EDUCATION_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`)) ||
    /\b(math|mathematics|calculus|linear algebra|algebra|geometry|physics|chemistry|biology|history|course|tutorial|lecture|syllabus|learn|learning|education|lesson|how to|explain|exam|university|college|khan academy|coursera|udemy)\b/.test(
      combinedText,
    )
  ) {
    return {
      category: 'Education & Learning',
      color: CATEGORY_COLORS['Education & Learning'],
    };
  }

  return { category: 'General Research', color: CATEGORY_COLORS['General Research'] };
}

async function getGroupMetadataMap(): Promise<Record<string, SavedWorkspaceGroup>> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return {};
  const data = await chrome.storage.local.get(GROUP_META_STORAGE_KEY);
  const raw = data[GROUP_META_STORAGE_KEY];
  return raw && typeof raw === 'object' ? (raw as Record<string, SavedWorkspaceGroup>) : {};
}

async function saveGroupMetadataMap(
  map: Record<string, SavedWorkspaceGroup>,
): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  await chrome.storage.local.set({ [GROUP_META_STORAGE_KEY]: map });
}

export interface OrganizeTabsResult {
  groupedTabsCount: number;
  groupsCreated: WorkspaceCategory[];
}

export async function organizeCurrentWindowTabs(): Promise<OrganizeTabsResult> {
  assertTabsApi();

  const tabs = await chrome.tabs.query({ currentWindow: true });
  const eligible = tabs.filter(
    (tab): tab is chrome.tabs.Tab & { id: number; url: string } =>
      typeof tab.id === 'number' && !tab.pinned && isOrganizableUrl(tab.url),
  );

  if (eligible.length === 0) {
    throw new Error('No organizable unpinned web tabs found in the current window.');
  }

  const buckets = new Map<
    WorkspaceCategory,
    { tabIds: number[]; tabUrls: string[] }
  >();
  for (const tab of eligible) {
    const { category } = classifyTab(tab.url, tab.title ?? '');
    const bucket = buckets.get(category) ?? { tabIds: [], tabUrls: [] };
    bucket.tabIds.push(tab.id);
    bucket.tabUrls.push(tab.url);
    buckets.set(category, bucket);
  }

  const metaMap = await getGroupMetadataMap();
  const groupsCreated: WorkspaceCategory[] = [];

  for (const [category, bucket] of buckets.entries()) {
    if (bucket.tabIds.length === 0) continue;
    const groupId = await chrome.tabs.group({
      tabIds: bucket.tabIds as [number, ...number[]],
    });
    const color = CATEGORY_COLORS[category];
    await chrome.tabGroups.update(groupId, {
      title: category,
      color,
    });

    const existingMeta = metaMap[category];
    metaMap[category] = {
      groupId,
      name: category,
      color,
      createdAt: existingMeta?.createdAt ?? new Date().toISOString(),
      tabUrls: bucket.tabUrls,
    };
    groupsCreated.push(category);
  }

  await saveGroupMetadataMap(metaMap);

  return {
    groupedTabsCount: eligible.length,
    groupsCreated,
  };
}

function buildWorkspaceName(): string {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `Workspace · ${time}`;
}

async function captureCurrentWorkspaceSnapshot(customName?: string): Promise<{
  workspace: SavedWorkspace;
  tabIds: number[];
  activeTabId: number | null;
}> {
  assertTabsApi();

  const tabs = await chrome.tabs.query({ currentWindow: true });
  const windowId = tabs[0]?.windowId;
  const existingGroups =
    typeof windowId === 'number' ? await chrome.tabGroups.query({ windowId }) : [];
  const metaMap = await getGroupMetadataMap();

  const groupMap = new Map<number, { title: string; color: TabGroupColor }>();
  for (const group of existingGroups) {
    groupMap.set(group.id, {
      title: group.title?.trim() || 'Grouped Tabs',
      color: group.color,
    });
  }

  const eligible = tabs.filter(
    (tab): tab is chrome.tabs.Tab & { id: number; url: string } =>
      typeof tab.id === 'number' && !tab.pinned && isOrganizableUrl(tab.url),
  );

  if (eligible.length === 0) {
    throw new Error('No saveable web tabs found in the current window.');
  }

  const savedGroupsMap = new Map<string, SavedWorkspaceGroup>();
  const savedTabs: SavedWorkspaceTab[] = eligible.map((tab) => {
    const groupInfo =
      typeof tab.groupId === 'number' && tab.groupId >= 0
        ? groupMap.get(tab.groupId)
        : undefined;

    if (groupInfo) {
      const existing = savedGroupsMap.get(groupInfo.title);
      if (existing) {
        existing.tabUrls.push(tab.url);
      } else {
        savedGroupsMap.set(groupInfo.title, {
          groupId: tab.groupId,
          name: groupInfo.title,
          color: groupInfo.color,
          createdAt: metaMap[groupInfo.title]?.createdAt ?? new Date().toISOString(),
          tabUrls: [tab.url],
        });
      }
    }

    return {
      url: tab.url,
      title: tab.title?.trim() || tab.url,
      groupName: groupInfo?.title ?? null,
      groupColor: groupInfo?.color ?? null,
    };
  });

  const activeTab = tabs.find((t) => t.active && typeof t.id === 'number');
  const workspace: SavedWorkspace = {
    id: `ws_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: customName?.trim() || buildWorkspaceName(),
    createdAt: new Date().toISOString(),
    groups: Array.from(savedGroupsMap.values()),
    tabs: savedTabs,
  };

  return {
    workspace,
    tabIds: eligible.map((t) => t.id),
    activeTabId: activeTab?.id ?? null,
  };
}

export async function saveCurrentWorkspace(customName?: string): Promise<SavedWorkspace> {
  const { workspace } = await captureCurrentWorkspaceSnapshot(customName);
  const existing = await getWorkspaces();

  const fingerprint = workspace.tabs.map((t) => normalizeUrl(t.url)).join('|');
  const deduplicated = existing.filter(
    (w) =>
      w.id !== workspace.id &&
      !(
        w.name === workspace.name &&
        w.tabs.map((t) => normalizeUrl(t.url)).join('|') === fingerprint
      ),
  );

  await saveWorkspaces([workspace, ...deduplicated]);
  return workspace;
}

export interface SaveAndCloseResult {
  workspace: SavedWorkspace;
  closedCount: number;
  keptActiveTab: boolean;
}

export async function saveAndCloseWorkspace(
  customName?: string,
): Promise<SaveAndCloseResult> {
  const { workspace, tabIds, activeTabId } =
    await captureCurrentWorkspaceSnapshot(customName);

  const existing = await getWorkspaces();
  const deduplicated = existing.filter((w) => w.id !== workspace.id);
  await saveWorkspaces([workspace, ...deduplicated]);

  const toClose = tabIds.filter((id) => id !== activeTabId);
  if (toClose.length > 0) {
    await chrome.tabs.remove(toClose);
  }

  return {
    workspace,
    closedCount: toClose.length,
    keptActiveTab: activeTabId !== null,
  };
}

export interface RestoreWorkspaceResult {
  reusedCount: number;
  createdCount: number;
  restoredGroupsCount: number;
}

export async function restoreWorkspace(
  workspace: SavedWorkspace,
): Promise<RestoreWorkspaceResult> {
  assertTabsApi();

  const currentTabs = await chrome.tabs.query({ currentWindow: true });
  const existingByUrl = new Map<string, number>();
  for (const tab of currentTabs) {
    if (typeof tab.id === 'number' && isOrganizableUrl(tab.url)) {
      const key = normalizeUrl(tab.url);
      if (!existingByUrl.has(key)) {
        existingByUrl.set(key, tab.id);
      }
    }
  }

  let reusedCount = 0;
  let createdCount = 0;
  const groupBuckets = new Map<
    string,
    { color: TabGroupColor; tabIds: number[]; tabUrls: string[] }
  >();

  for (const savedTab of workspace.tabs) {
    if (!isOrganizableUrl(savedTab.url)) continue;
    const key = normalizeUrl(savedTab.url);
    let tabId = existingByUrl.get(key);

    if (typeof tabId === 'number') {
      reusedCount += 1;
    } else {
      const created = await chrome.tabs.create({
        url: savedTab.url,
        active: false,
      });
      if (typeof created.id !== 'number') continue;
      tabId = created.id;
      existingByUrl.set(key, tabId);
      createdCount += 1;
    }

    if (savedTab.groupName) {
      const savedGroup = workspace.groups.find((g) => g.name === savedTab.groupName);
      const color = savedTab.groupColor ?? savedGroup?.color ?? 'green';
      const bucket = groupBuckets.get(savedTab.groupName) ?? {
        color,
        tabIds: [],
        tabUrls: [],
      };
      bucket.tabIds.push(tabId);
      bucket.tabUrls.push(savedTab.url);
      groupBuckets.set(savedTab.groupName, bucket);
    }
  }

  const metaMap = await getGroupMetadataMap();
  let restoredGroupsCount = 0;

  for (const [groupName, bucket] of groupBuckets.entries()) {
    if (bucket.tabIds.length === 0) continue;
    const groupId = await chrome.tabs.group({
      tabIds: bucket.tabIds as [number, ...number[]],
    });
    await chrome.tabGroups.update(groupId, {
      title: groupName,
      color: bucket.color,
    });

    const savedGroup = workspace.groups.find((g) => g.name === groupName);
    metaMap[groupName] = {
      groupId,
      name: groupName,
      color: bucket.color,
      createdAt: savedGroup?.createdAt ?? metaMap[groupName]?.createdAt ?? new Date().toISOString(),
      tabUrls: bucket.tabUrls,
    };
    restoredGroupsCount += 1;
  }

  await saveGroupMetadataMap(metaMap);

  return {
    reusedCount,
    createdCount,
    restoredGroupsCount,
  };
}
