import type { PageReadResult } from '../types';
import { GlobeIcon } from './Icons';

interface CurrentPageCardProps {
  pageResult: PageReadResult | null;
  focusMode: boolean;
  busy: boolean;
  onReadPage: () => void;
  onToggleFocusMode: () => void;
}

export function CurrentPageCard({
  pageResult,
  focusMode,
  busy,
  onReadPage,
  onToggleFocusMode,
}: CurrentPageCardProps) {
  return (
    <section className="card page-context-wrapper" aria-label="Current page context">
      <div className="page-context-card" style={{ padding: 0 }}>
        <span className="page-context-icon">
          <GlobeIcon />
        </span>
        <div className="page-context-body">
          <div className="page-context-title">
            {pageResult ? pageResult.title : 'Current Page Context'}
          </div>
          <div className="page-context-url" title={pageResult?.url}>
            {pageResult ? pageResult.url : 'Click "Read Current Page" to inspect the active tab'}
          </div>
        </div>
      </div>

      {pageResult && (
        <>
          <div className="page-read-meta">
            <span>Page read successfully</span>
            <span>{pageResult.wordCount.toLocaleString()} words</span>
          </div>
          <div className="page-read-preview">{pageResult.preview}</div>
        </>
      )}

      <div className="page-context-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={onReadPage}
        >
          Read Current Page
        </button>
        <button
          type="button"
          className={`btn btn-secondary${focusMode ? ' btn-toggle-active' : ''}`}
          aria-pressed={focusMode}
          disabled={busy}
          onClick={onToggleFocusMode}
        >
          {focusMode ? 'Focus Mode: On' : 'Focus Mode'}
        </button>
      </div>
    </section>
  );
}
