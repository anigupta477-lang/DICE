import { useCallback, useEffect, useRef, useState } from 'react';
import { Conversation } from '@elevenlabs/client';
import type { Mode, Status } from '@elevenlabs/client';

const AGENT_ID_STORAGE_KEY = 'dice_elevenlabs_agent_id';
const MIC_PERMISSION_STORAGE_KEY = 'dice_mic_permission_granted';

function extractResearchQuery(rawParams: unknown): string {
  if (typeof rawParams === 'string') {
    const trimmed = rawParams.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('{') || trimmed.startsWith('"')) {
      try {
        return extractResearchQuery(JSON.parse(trimmed));
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }

  if (rawParams && typeof rawParams === 'object') {
    const obj = rawParams as Record<string, unknown>;
    for (const key of ['query', 'research_query', 'topic', 'prompt', 'q']) {
      if (typeof obj[key] === 'string' && obj[key].trim()) {
        return obj[key].trim();
      }
    }
    for (const nestedKey of ['parameters', 'arguments', 'input', 'data']) {
      if (obj[nestedKey] !== undefined) {
        const nested = extractResearchQuery(obj[nestedKey]);
        if (nested) return nested;
      }
    }
  }

  return '';
}

async function isMicPermissionGranted(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      });
      if (status.state === 'granted') return true;
      if (status.state === 'denied' || status.state === 'prompt') return false;
    } catch {
      // Fallback to storage flag below if permissions.query is unsupported.
    }
  }
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const data = await chrome.storage.local.get(MIC_PERMISSION_STORAGE_KEY);
      return data[MIC_PERMISSION_STORAGE_KEY] === true;
    } catch {
      return false;
    }
  }
  return false;
}

export interface VoiceTranscriptLine {
  id: string;
  role: 'user' | 'agent' | 'tool' | 'system';
  text: string;
}

interface VoiceToolHandlers {
  getCurrentPage: () => Promise<string>;
  organizeTabs: () => Promise<string>;
  setFocusMode: (enabled: boolean) => Promise<string>;
  startResearch: (query: string) => Promise<string>;
  highlightSelectedText: () => Promise<string>;
  onVoiceStatusChange: (status: 'Idle' | 'Working' | 'Error') => void;
}

export function useVoiceSteering(handlers: VoiceToolHandlers) {
  const envAgentId = (import.meta.env.VITE_ELEVENLABS_AGENT_ID || '').trim();
  const [agentId, setAgentIdState] = useState<string>(envAgentId);
  const [voiceStatus, setVoiceStatus] = useState<Status>('disconnected');
  const [voiceMode, setVoiceMode] = useState<Mode>('listening');
  const [isMuted, setIsMuted] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<VoiceTranscriptLine[]>([]);

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const convRef = useRef<Conversation | null>(null);

  useEffect(() => {
    if (envAgentId) return;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(AGENT_ID_STORAGE_KEY).then((data) => {
        const saved = data[AGENT_ID_STORAGE_KEY];
        if (typeof saved === 'string' && saved.trim()) {
          setAgentIdState(saved.trim());
        }
      }).catch(() => {});
    }
  }, [envAgentId]);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
    const listener = (message: { type?: string }) => {
      if (message?.type === 'MIC_PERMISSION_GRANTED') {
        setVoiceError(null);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const setAgentId = useCallback((nextId: string) => {
    const trimmed = nextId.trim();
    setAgentIdState(trimmed);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      void chrome.storage.local.set({ [AGENT_ID_STORAGE_KEY]: trimmed }).catch(() => {});
    }
  }, []);

  const appendLine = useCallback((role: VoiceTranscriptLine['role'], text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setTranscript((prev) => [
      ...prev.slice(-19),
      { id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, role, text: clean },
    ]);
  }, []);

  const stopVoice = useCallback(async () => {
    const conv = convRef.current;
    convRef.current = null;
    if (conv) {
      await conv.endSession().catch(() => {});
    }
    setVoiceStatus('disconnected');
    setVoiceMode('listening');
    setIsMuted(false);
    handlersRef.current.onVoiceStatusChange('Idle');
  }, []);

  const startVoice = useCallback(async () => {
    const targetId = agentId.trim();
    if (!targetId) {
      setVoiceError('Enter your ElevenLabs Agent ID below or set VITE_ELEVENLABS_AGENT_ID in .env.');
      return;
    }

    const micGranted = await isMicPermissionGranted();
    if (!micGranted) {
      if (typeof chrome !== 'undefined' && chrome.tabs?.create && chrome.runtime?.getURL) {
        await chrome.tabs.create({
          url: chrome.runtime.getURL('mic-permission.html'),
          active: true,
        });
      }
      setVoiceError(
        'Microphone permission is required. Click "Enable Microphone" in the opened tab, then click Connect again.',
      );
      handlersRef.current.onVoiceStatusChange('Idle');
      return;
    }

    setVoiceError(null);
    if (convRef.current) {
      await convRef.current.endSession().catch(() => {});
      convRef.current = null;
    }

    setVoiceStatus('connecting');
    handlersRef.current.onVoiceStatusChange('Working');

    try {
      const session = await Conversation.startSession({
        agentId: targetId,
        connectionType: 'webrtc',
        onConnect: () => {
          setVoiceStatus('connected');
          setVoiceError(null);
          handlersRef.current.onVoiceStatusChange('Working');
          appendLine('system', 'Voice session connected.');
        },
        onDisconnect: (details) => {
          convRef.current = null;
          setVoiceStatus('disconnected');
          setVoiceMode('listening');
          setIsMuted(false);
          if (details.reason === 'error') {
            setVoiceError(details.message || 'Voice session disconnected.');
            handlersRef.current.onVoiceStatusChange('Error');
          } else {
            handlersRef.current.onVoiceStatusChange('Idle');
          }
        },
        onMessage: (payload) => {
          appendLine(payload.role === 'user' ? 'user' : 'agent', payload.message);
        },
        onModeChange: ({ mode }) => {
          setVoiceMode(mode);
        },
        onStatusChange: ({ status }) => {
          setVoiceStatus(status);
        },
        onError: (msg) => {
          setVoiceError(msg);
          handlersRef.current.onVoiceStatusChange('Error');
          appendLine('system', `Error: ${msg}`);
        },
        clientTools: {
          get_current_page: async () => {
            appendLine('tool', 'Calling get_current_page()');
            return handlersRef.current.getCurrentPage();
          },
          organize_tabs: async () => {
            appendLine('tool', 'Calling organize_tabs()');
            return handlersRef.current.organizeTabs();
          },
          set_focus_mode: async (params: { enabled?: boolean }) => {
            const enabled = typeof params?.enabled === 'boolean' ? params.enabled : true;
            appendLine('tool', `Calling set_focus_mode(${enabled})`);
            return handlersRef.current.setFocusMode(enabled);
          },
          start_research: async (rawParams: unknown) => {
            console.debug('[DICE][Voice] start_research raw args:', rawParams);
            const normalizedQuery = extractResearchQuery(rawParams);
            console.debug('[DICE][Voice] start_research normalized query:', normalizedQuery);
            appendLine('tool', `Calling start_research("${normalizedQuery}")`);
            if (!normalizedQuery) {
              return 'Validation Error: A non-empty "query" string is required.';
            }
            return handlersRef.current.startResearch(normalizedQuery);
          },
          highlight_selected_text: async () => {
            appendLine('tool', 'Calling highlight_selected_text()');
            return handlersRef.current.highlightSelectedText();
          },
        },
      });
      convRef.current = session;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start ElevenLabs voice session.';
      setVoiceStatus('disconnected');
      setVoiceError(msg);
      handlersRef.current.onVoiceStatusChange('Error');
    }
  }, [agentId, appendLine]);

  const toggleMute = useCallback(() => {
    const conv = convRef.current;
    if (!conv || !conv.isOpen()) return;
    const next = !isMuted;
    conv.setMicMuted(next);
    setIsMuted(next);
  }, [isMuted]);

  useEffect(() => {
    return () => {
      void convRef.current?.endSession().catch(() => {});
    };
  }, []);

  return {
    agentId,
    setAgentId,
    voiceStatus,
    voiceMode,
    isMuted,
    voiceError,
    transcript,
    startVoice,
    stopVoice,
    toggleMute,
  };
}
