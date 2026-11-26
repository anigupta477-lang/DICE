import type { SavedClip, SavedWorkspace } from '../types';

export const WORKSPACES_STORAGE_KEY = 'dice_workspaces';
export const CLIPS_STORAGE_KEY = 'dice_clips';

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

export async function getWorkspaces(): Promise<SavedWorkspace[]> {
  if (!hasChromeStorage()) return [];
  const data = await chrome.storage.local.get(WORKSPACES_STORAGE_KEY);
  const raw = data[WORKSPACES_STORAGE_KEY];
  return Array.isArray(raw) ? (raw as SavedWorkspace[]) : [];
}

export async function saveWorkspaces(workspaces: SavedWorkspace[]): Promise<void> {
  if (!hasChromeStorage()) {
    throw new Error('Chrome storage API is unavailable outside the extension context.');
  }
  await chrome.storage.local.set({ [WORKSPACES_STORAGE_KEY]: workspaces });
}

export async function deleteWorkspaceById(workspaceId: string): Promise<SavedWorkspace[]> {
  const current = await getWorkspaces();
  const next = current.filter((w) => w.id !== workspaceId);
  await saveWorkspaces(next);
  return next;
}

export async function getClips(): Promise<SavedClip[]> {
  if (!hasChromeStorage()) return [];
  const data = await chrome.storage.local.get(CLIPS_STORAGE_KEY);
  const raw = data[CLIPS_STORAGE_KEY];
  return Array.isArray(raw) ? (raw as SavedClip[]) : [];
}

export async function deleteClipById(clipId: string): Promise<SavedClip[]> {
  const current = await getClips();
  const next = current.filter((c) => c.id !== clipId);
  if (!hasChromeStorage()) {
    throw new Error('Chrome storage API is unavailable outside the extension context.');
  }
  await chrome.storage.local.set({ [CLIPS_STORAGE_KEY]: next });
  return next;
}

export function subscribeStorageChanges(callbacks: {
  onWorkspacesChange?: (workspaces: SavedWorkspace[]) => void;
  onClipsChange?: (clips: SavedClip[]) => void;
}): () => void {
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) {
    return () => {};
  }

  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'local') return;
    if (changes[WORKSPACES_STORAGE_KEY] && callbacks.onWorkspacesChange) {
      const next = changes[WORKSPACES_STORAGE_KEY].newValue;
      callbacks.onWorkspacesChange(Array.isArray(next) ? (next as SavedWorkspace[]) : []);
    }
    if (changes[CLIPS_STORAGE_KEY] && callbacks.onClipsChange) {
      const next = changes[CLIPS_STORAGE_KEY].newValue;
      callbacks.onClipsChange(Array.isArray(next) ? (next as SavedClip[]) : []);
    }
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
