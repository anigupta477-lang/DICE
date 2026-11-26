import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { DiceLogoIcon, MicIcon } from './components/Icons';

const MIC_PERMISSION_STORAGE_KEY = 'dice_mic_permission_granted';

function MicPermissionPage() {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'granted' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleEnableMicrophone = async () => {
    setStatus('requesting');
    setErrorMessage(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('error');
      setErrorMessage('Microphone API is unavailable in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({ [MIC_PERMISSION_STORAGE_KEY]: true });
      }
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'MIC_PERMISSION_GRANTED' }).catch(() => {});
      }

      setStatus('granted');
    } catch (err) {
      setStatus('error');
      const domErr = err as DOMException | undefined;
      const name = domErr?.name ?? '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setErrorMessage(
          'Microphone permission was denied. Please allow microphone access in Chrome site settings and try again.',
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setErrorMessage(
          'No microphone device was found. Please connect a microphone and try again.',
        );
      } else {
        setErrorMessage(
          domErr?.message || 'Unable to access microphone. Please check your device settings.',
        );
      }
    }
  };

  return (
    <div className="app-shell" style={{ justifyContent: 'center', padding: 24 }}>
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="header-brand">
          <span className="brand-mark">
            <DiceLogoIcon />
          </span>
          <div className="brand-text">
            <h1 className="brand-title">DICE Microphone Setup</h1>
            <p className="brand-subtitle">Voice Steering permission for Chrome</p>
          </div>
        </div>

        <p className="page-intro">
          Chrome requires microphone permission to be granted from a standard tab before DICE can start ElevenLabs Voice Steering in the side panel.
        </p>

        {status === 'granted' ? (
          <div className="result-section" role="status">
            <strong style={{ color: 'var(--accent-forest)', fontSize: 13 }}>
              Microphone permission granted
            </strong>
            <p className="page-intro">
              You can now return to the DICE side panel and click Connect to start your voice session.
            </p>
            <div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => window.close()}
              >
                Close Tab &amp; Return to DICE
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={status === 'requesting'}
              onClick={() => void handleEnableMicrophone()}
            >
              <MicIcon />
              {status === 'requesting' ? 'Requesting Access…' : 'Enable Microphone'}
            </button>
            {errorMessage && (
              <div className="voice-error" role="alert">
                {errorMessage}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MicPermissionPage />
  </StrictMode>,
);
