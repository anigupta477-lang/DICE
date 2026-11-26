import { useState } from 'react';
import type { Mode, Status } from '@elevenlabs/client';
import type { VoiceTranscriptLine } from '../hooks/useVoiceSteering';
import { MicIcon } from './Icons';

interface ResearchInputProps {
  query: string;
  onQueryChange: (value: string) => void;
  onStartResearch: () => void;
  voiceStatus: Status;
  voiceMode: Mode;
  isMuted: boolean;
  agentId: string;
  voiceError: string | null;
  transcript: VoiceTranscriptLine[];
  onAgentIdChange: (id: string) => void;
  onStartVoice: () => void;
  onStopVoice: () => void;
  onToggleMute: () => void;
}

export function ResearchInput({
  query,
  onQueryChange,
  onStartResearch,
  voiceStatus,
  voiceMode,
  isMuted,
  agentId,
  voiceError,
  transcript,
  onAgentIdChange,
  onStartVoice,
  onStopVoice,
  onToggleMute,
}: ResearchInputProps) {
  const [showVoiceDrawer, setShowVoiceDrawer] = useState(false);
  const isConnected = voiceStatus === 'connected';
  const isConnecting = voiceStatus === 'connecting';

  const handleMicButton = () => {
    setShowVoiceDrawer(true);
    if (isConnected || isConnecting) {
      onStopVoice();
    } else if (agentId.trim()) {
      onStartVoice();
    }
  };

  return (
    <section className="card" aria-labelledby="research-heading">
      <h2 id="research-heading" className="research-heading">
        What would you like to research?
      </h2>
      <textarea
        className="research-textarea"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Ask a question, compare options, or investigate a topic..."
        aria-label="Research query"
      />
      <div className="research-actions">
        <button
          type="button"
          className={`btn btn-icon${isConnected ? ' btn-toggle-active' : ''}`}
          title={isConnected ? 'Stop Voice Steering' : 'Start Voice Steering (ElevenLabs)'}
          aria-label="Toggle voice steering"
          aria-pressed={isConnected}
          onClick={handleMicButton}
        >
          <MicIcon />
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onStartResearch}
        >
          Start Research
        </button>
      </div>

      {(showVoiceDrawer || isConnected || isConnecting || voiceError) && (
        <div className="voice-drawer">
          <div className="voice-drawer-top">
            <span className="voice-status-label">
              Voice:{' '}
              {isConnected
                ? voiceMode === 'speaking'
                  ? 'Speaking'
                  : 'Listening'
                : isConnecting
                  ? 'Connecting…'
                  : 'Idle'}
            </span>
            <div className="voice-drawer-btns">
              {isConnected && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onToggleMute}
                >
                  {isMuted ? 'Unmute' : 'Mute'}
                </button>
              )}
              {isConnected || isConnecting ? (
                <button
                  type="button"
                  className="btn btn-danger-ghost btn-sm"
                  onClick={onStopVoice}
                >
                  End
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={onStartVoice}
                >
                  Connect
                </button>
              )}
            </div>
          </div>

          {!isConnected && !isConnecting && (
            <input
              type="text"
              className="voice-agent-input"
              value={agentId}
              onChange={(e) => onAgentIdChange(e.target.value)}
              placeholder="ElevenLabs Agent ID (or set VITE_ELEVENLABS_AGENT_ID)"
              aria-label="ElevenLabs Agent ID"
            />
          )}

          {voiceError && <div className="voice-error">{voiceError}</div>}

          {transcript.length > 0 && (
            <div className="voice-transcript" aria-live="polite">
              {transcript.slice(-3).map((line) => (
                <div key={line.id} className={`voice-line is-${line.role}`}>
                  <strong>
                    {line.role === 'user'
                      ? 'You: '
                      : line.role === 'agent'
                        ? 'DICE: '
                        : line.role === 'tool'
                          ? 'Tool: '
                          : ''}
                  </strong>
                  {line.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
