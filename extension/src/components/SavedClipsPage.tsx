import type { SavedClip } from '../types';
import { BookmarkIcon } from './Icons';

interface SavedClipsPageProps {
  clips: SavedClip[];
  onDeleteClip: (clipId: string) => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function SavedClipsPage({ clips, onDeleteClip }: SavedClipsPageProps) {
  return (
    <section className="card" aria-labelledby="saved-clips-heading">
      <div className="section-header">
        <h2 id="saved-clips-heading" className="section-title">
          Your Saved Clips
        </h2>
        <span className="section-meta">
          {clips.length} {clips.length === 1 ? 'clip' : 'clips'}
        </span>
      </div>

      {clips.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">
            <BookmarkIcon />
          </span>
          <h3 className="empty-state-title">No saved clips yet</h3>
          <p className="empty-state-text">
            Select text on any webpage, right-click, and choose &ldquo;Save &amp; Highlight in DICE&rdquo; to save and highlight excerpts here.
          </p>
        </div>
      ) : (
        <div className="item-list">
          {clips.map((clip) => (
            <article key={clip.id} className="saved-item-card">
              <p className="clip-text">{clip.text}</p>
              <div className="saved-item-top">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="saved-item-title">{clip.title}</div>
                  {clip.url && (
                    <a
                      className="clip-url"
                      href={clip.url}
                      target="_blank"
                      rel="noreferrer"
                      title={clip.url}
                    >
                      {clip.url}
                    </a>
                  )}
                  <div className="saved-item-meta">{formatDate(clip.createdAt)}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-danger-ghost btn-sm"
                  onClick={() => onDeleteClip(clip.id)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
