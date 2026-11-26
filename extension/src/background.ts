import type { SavedClip } from './types';

const CONTEXT_MENU_ID = 'dice-save-selection';
const CLIPS_STORAGE_KEY = 'dice_clips';
const LATEST_SELECTION_KEY = 'dice_latest_selection';
const MAX_CLIP_CHARS = 4000;

function installSelectionTrackerInPage(): void {
  const w = window as unknown as { __diceSelectionTrackerInstalled?: boolean };
  if (w.__diceSelectionTrackerInstalled) return;
  w.__diceSelectionTrackerInstalled = true;

  let timer: number | undefined;
  let lastSent = '';

  const reportSelection = () => {
    const text = window.getSelection()?.toString().trim() ?? '';
    if (!text || text === lastSent) return;
    lastSent = text;
    try {
      chrome.runtime.sendMessage({
        type: 'DICE_SELECTION_UPDATED',
        text: text.slice(0, 4000),
      });
    } catch {
      // Extension context may be invalidated on reload.
    }
  };

  document.addEventListener('selectionchange', () => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(reportSelection, 150);
  });
}

async function ensureSelectionTrackerOnTab(tabId?: number, url?: string): Promise<void> {
  if (typeof tabId !== 'number' || !isHighlightableUrl(url)) return;
  try {
    const originPattern = `${new URL(url).origin}/*`;
    const hasPerm = await chrome.permissions.contains({ origins: [originPattern] });
    if (!hasPerm) return;
    await chrome.scripting.executeScript({
      target: { tabId },
      func: installSelectionTrackerInPage,
    });
  } catch {
    // Ignore restricted/closed tabs.
  }
}

function configureSidePanelBehavior(): void {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => {
        console.warn('[DICE] Failed to set side panel behavior:', error);
      });
  }
}

function registerContextMenu(): void {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      console.warn('[DICE] contextMenus.removeAll warning:', chrome.runtime.lastError.message);
    }
    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_ID,
        title: 'Save & Highlight in DICE',
        contexts: ['selection'],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.warn('[DICE] contextMenus.create warning:', chrome.runtime.lastError.message);
        }
      },
    );
  });
}

function isHighlightableUrl(url?: string): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return host !== 'chrome.google.com' && host !== 'chromewebstore.google.com';
  } catch {
    return false;
  }
}

function highlightSelectionInPage(targetText: string): {
  highlighted: boolean;
  alreadyHighlighted?: boolean;
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
      const mark = createMark();
      range.surroundContents(mark);
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

  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    const selRange = sel.getRangeAt(0);
    if (selRange.toString().trim().length > 0) {
      const res = wrapRange(selRange);
      sel.removeAllRanges();
      return res;
    }
  }

  const needle = targetText.trim();
  if (!needle || !document.body) return { highlighted: false };

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const idx = textNode.data.indexOf(needle);
    if (idx !== -1 && !isInsideMark(textNode)) {
      const matchRange = document.createRange();
      matchRange.setStart(textNode, idx);
      matchRange.setEnd(textNode, idx + needle.length);
      return wrapRange(matchRange);
    }
    node = walker.nextNode();
  }

  return { highlighted: false };
}

function notifyPanel(payload: Record<string, unknown>): void {
  chrome.runtime.sendMessage(payload).catch(() => {
    // Side panel may not be open.
  });
}

chrome.runtime.onInstalled.addListener(() => {
  configureSidePanelBehavior();
  registerContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  configureSidePanelBehavior();
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then((tab) => {
    void ensureSelectionTrackerOnTab(tab.id, tab.url);
  }).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    void ensureSelectionTrackerOnTab(tabId, tab.url);
  }
});

chrome.permissions.onAdded.addListener(() => {
  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (tab) void ensureSelectionTrackerOnTab(tab.id, tab.url);
  }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (
    message?.type === 'DICE_SELECTION_UPDATED' &&
    typeof message.text === 'string' &&
    message.text.trim() &&
    chrome.storage?.session
  ) {
    void chrome.storage.session.set({
      [LATEST_SELECTION_KEY]: {
        text: message.text.trim(),
        tabId: sender.tab?.id ?? null,
        url: sender.tab?.url ?? '',
        title: sender.tab?.title ?? '',
        updatedAt: new Date().toISOString(),
      },
    });
  }
});

configureSidePanelBehavior();

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;

  const rawText = info.selectionText?.trim() ?? '';
  if (!rawText) return;

  notifyPanel({ type: 'MORPH_STATUS', status: 'Working' });

  const clippedText =
    rawText.length > MAX_CLIP_CHARS
      ? `${rawText.slice(0, MAX_CLIP_CHARS)}…`
      : rawText;

  const clip: SavedClip = {
    id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    text: clippedText,
    url: tab?.url || info.pageUrl || '',
    title: tab?.title?.trim() || 'Untitled Page',
    createdAt: new Date().toISOString(),
  };

  try {
    const data = await chrome.storage.local.get(CLIPS_STORAGE_KEY);
    const existing = Array.isArray(data[CLIPS_STORAGE_KEY])
      ? (data[CLIPS_STORAGE_KEY] as SavedClip[])
      : [];
    await chrome.storage.local.set({
      [CLIPS_STORAGE_KEY]: [clip, ...existing],
    });
  } catch (error) {
    console.error('[DICE] Failed to save clip:', error);
    notifyPanel({ type: 'MORPH_STATUS', status: 'Idle' });
    notifyPanel({ type: 'CLIP_SAVE_ERROR', message: 'Failed to save selected text.' });
    return;
  }

  let highlighted = false;
  let reason: 'NO_PERMISSION' | 'UNSUPPORTED' | 'FAILED' | undefined;

  if (typeof tab?.id === 'number' && isHighlightableUrl(tab.url)) {
    try {
      const originPattern = `${new URL(tab.url).origin}/*`;
      const hasPerm = await chrome.permissions.contains({ origins: [originPattern] });
      if (!hasPerm) {
        reason = 'NO_PERMISSION';
      } else {
        const res = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: highlightSelectionInPage,
          args: [rawText],
        });
        highlighted = Boolean(res[0]?.result?.highlighted);
        if (!highlighted) reason = 'FAILED';
      }
    } catch (error) {
      console.warn('[DICE] Highlighting failed:', error);
      reason = 'FAILED';
    }
  } else {
    reason = 'UNSUPPORTED';
  }

  notifyPanel({ type: 'MORPH_STATUS', status: 'Completed' });
  notifyPanel({ type: 'CLIP_SAVED', clip, highlighted, reason });
});
