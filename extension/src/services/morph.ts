import type { PageReadResult } from '../types';

const MAX_EXTRACTED_CHARS = 12_000;
const PREVIEW_CHARS = 240;

const FOCUS_MODE_CSS = `
aside,
[role="complementary"],
[aria-label*="advertisement" i],
[class*="ad-slot" i],
[class*="ad-banner" i],
[class*="sponsored" i],
[id*="ad-container" i],
[class*="promo-banner" i],
[class*="newsletter-popup" i] {
  display: none !important;
}

article,
main,
[role="main"] {
  max-width: 760px !important;
  margin-left: auto !important;
  margin-right: auto !important;
  line-height: 1.7 !important;
}
`.trim();

function assertScriptingApi(): void {
  if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.scripting) {
    throw new Error('Chrome Scripting API is only available inside the Chrome extension.');
  }
}

function isScriptableUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (host === 'chrome.google.com' || host === 'chromewebstore.google.com') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function ensureOriginPermission(url: string): Promise<void> {
  if (!chrome.permissions) {
    throw new Error('Chrome Permissions API is unavailable.');
  }

  const parsed = new URL(url);
  const originPattern = `${parsed.origin}/*`;

  const alreadyGranted = await chrome.permissions.contains({
    origins: [originPattern],
  });
  if (alreadyGranted) return;

  const granted = await chrome.permissions.request({
    origins: [originPattern],
  });
  if (!granted) {
    throw new Error(
      `Permission denied for ${parsed.hostname}. Please allow site access when prompted to use this feature.`,
    );
  }
}

async function getActiveScriptableTab(): Promise<chrome.tabs.Tab & { id: number; url: string }> {
  assertScriptingApi();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || typeof tab.id !== 'number') {
    throw new Error('No active browser tab found.');
  }

  if (!isScriptableUrl(tab.url)) {
    throw new Error(
      'Unsupported page: chrome://, extension, and Chrome Web Store pages cannot be accessed.',
    );
  }

  return tab as chrome.tabs.Tab & { id: number; url: string };
}

export async function readCurrentPage(): Promise<PageReadResult> {
  const tab = await getActiveScriptableTab();
  await ensureOriginPermission(tab.url);

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (maxChars: number) => {
      const raw = document.body?.innerText ?? '';
      const cleaned = raw.replace(/\n{3,}/g, '\n\n').trim();
      const limited = cleaned.slice(0, maxChars);
      return {
        title: document.title || '',
        url: window.location.href || '',
        text: limited,
      };
    },
    args: [MAX_EXTRACTED_CHARS],
  });

  const payload = results[0]?.result;
  if (!payload) {
    throw new Error('Could not extract text from the active webpage.');
  }

  const text = payload.text.trim();
  const wordCount = text ? text.split(/\s+/).length : 0;
  const preview =
    text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS).trim()}…` : text;

  return {
    title: payload.title || tab.title || 'Untitled Page',
    url: payload.url || tab.url,
    wordCount,
    preview: preview || 'No readable text content found on this page.',
    textLength: text.length,
    readAt: new Date().toISOString(),
  };
}

export async function setFocusMode(enabled: boolean): Promise<{ tabTitle: string }> {
  const tab = await getActiveScriptableTab();
  await ensureOriginPermission(tab.url);

  if (enabled) {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      css: FOCUS_MODE_CSS,
    });
  } else {
    await chrome.scripting.removeCSS({
      target: { tabId: tab.id },
      css: FOCUS_MODE_CSS,
    });
  }

  return { tabTitle: tab.title || tab.url };
}

const LATEST_SELECTION_KEY = 'dice_latest_selection';

interface StoredSelection {
  text: string;
  tabId: number | null;
  url: string;
  title: string;
  updatedAt: string;
}

function highlightTextInPage(targetText: string): {
  highlighted: boolean;
  alreadyHighlighted?: boolean;
  foundText?: boolean;
} {
  const MARK_ATTR = 'data-dice-highlight';
  const createMark = (): HTMLElement => {
    const mark = document.createElement('mark');
    mark.setAttribute(MARK_ATTR, '1');
    mark.style.backgroundColor = '#DCE8DA';
    mark.style.color = '#233C31';
    mark.style.borderRadius = '3px';
    mark.style.padding = '0 3px';
    return mark;
  };

  const isInsideMark = (node: Node | null): boolean => {
    let cur: Node | null = node;
    while (cur) {
      if (
        cur instanceof HTMLElement &&
        cur.tagName === 'MARK' &&
        cur.getAttribute(MARK_ATTR) === '1'
      ) {
        return true;
      }
      cur = cur.parentNode;
    }
    return false;
  };

  const wrapRange = (range: Range): { highlighted: boolean; alreadyHighlighted?: boolean } => {
    if (isInsideMark(range.startContainer) || isInsideMark(range.endContainer)) {
      return { highlighted: true, alreadyHighlighted: true };
    }
    if (
      range.startContainer === range.endContainer &&
      range.startContainer.nodeType === Node.TEXT_NODE
    ) {
      range.surroundContents(createMark());
      return { highlighted: true };
    }

    const root = range.commonAncestorContainer;
    const walkerRoot =
      root.nodeType === Node.TEXT_NODE ? (root.parentNode ?? document.body) : root;
    const walker = document.createTreeWalker(walkerRoot, NodeFilter.SHOW_TEXT);
    const segments: Array<{ node: Text; start: number; end: number }> = [];

    let current = walker.nextNode();
    while (current) {
      const textNode = current as Text;
      if (textNode.data.length > 0 && range.intersectsNode(textNode) && !isInsideMark(textNode)) {
        const start = textNode === range.startContainer ? range.startOffset : 0;
        const end = textNode === range.endContainer ? range.endOffset : textNode.data.length;
        if (end > start && textNode.data.slice(start, end).trim().length > 0) {
          segments.push({ node: textNode, start, end });
        }
      }
      current = walker.nextNode();
    }

    if (segments.length === 0) return { highlighted: false };
    for (const seg of segments) {
      const subRange = document.createRange();
      subRange.setStart(seg.node, seg.start);
      subRange.setEnd(seg.node, seg.end);
      subRange.surroundContents(createMark());
    }
    return { highlighted: true };
  };

  const needle = targetText.trim();
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    const selText = sel.toString().trim();
    if (selText && (!needle || selText === needle)) {
      const res = wrapRange(sel.getRangeAt(0));
      sel.removeAllRanges();
      return { ...res, foundText: true };
    }
  }

  if (!needle || !document.body) {
    return { highlighted: false, foundText: false };
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const idx = textNode.data.indexOf(needle);
    if (idx !== -1 && !isInsideMark(textNode)) {
      const matchRange = document.createRange();
      matchRange.setStart(textNode, idx);
      matchRange.setEnd(textNode, idx + needle.length);
      return { ...wrapRange(matchRange), foundText: true };
    }
    node = walker.nextNode();
  }

  return { highlighted: false, foundText: true };
}

export async function highlightLatestSelection(): Promise<{
  highlighted: boolean;
  tabTitle: string;
  url: string;
  emptySelection?: boolean;
}> {
  assertScriptingApi();

  let stored: StoredSelection | null = null;
  if (chrome.storage?.session) {
    const data = await chrome.storage.session.get(LATEST_SELECTION_KEY);
    const raw = data[LATEST_SELECTION_KEY];
    if (raw && typeof raw === 'object' && typeof (raw as StoredSelection).text === 'string') {
      stored = raw as StoredSelection;
    }
  }

  let targetTab: (chrome.tabs.Tab & { id: number; url: string }) | null = null;
  if (stored && typeof stored.tabId === 'number') {
    try {
      const candidate = await chrome.tabs.get(stored.tabId);
      if (candidate && typeof candidate.id === 'number' && isScriptableUrl(candidate.url)) {
        targetTab = candidate as chrome.tabs.Tab & { id: number; url: string };
      }
    } catch {
      targetTab = null;
    }
  }

  if (!targetTab) {
    targetTab = await getActiveScriptableTab();
  }

  await ensureOriginPermission(targetTab.url);

  const selectedText = stored?.text?.trim() ?? '';
  const res = await chrome.scripting.executeScript({
    target: { tabId: targetTab.id },
    func: highlightTextInPage,
    args: [selectedText],
  });

  const outcome = res[0]?.result;
  if (!outcome?.foundText) {
    return {
      highlighted: false,
      tabTitle: targetTab.title || targetTab.url,
      url: targetTab.url,
      emptySelection: true,
    };
  }

  return {
    highlighted: Boolean(outcome.highlighted),
    tabTitle: targetTab.title || targetTab.url,
    url: targetTab.url,
  };
}
