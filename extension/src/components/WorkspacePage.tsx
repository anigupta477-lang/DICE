import { useState } from 'react';
import type { SavedWorkspace } from '../types';

interface WorkspacePageProps {
  workspaces: SavedWorkspace[];
  busy: boolean;
  onOrganizeTabs: () => void;
  onSaveWorkspace: () => void;
  onSaveAndClose: () => void;
  onRestoreWorkspace: (workspace: SavedWorkspace) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
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

function formatGroupCreatedAt(iso: string): string {
  try {
    const date = new Date(iso);
    const datePart = new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
    const timePart = date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `Created ${datePart} · ${timePart}`;
  } catch {
    return `Created ${iso}`;
  }
}

export function WorkspacePage({
  workspaces,
  busy,
  onOrganizeTabs,
  onSaveWorkspace,
  onSaveAndClose,
  onRestoreWorkspace,
  onDeleteWorkspace,
}: WorkspacePageProps) {
  const [confirmClose, setConfirmClose] = useState(false);

  return (
    <div className="page-stack">
      <section className="card" aria-labelledby="workspace-heading">
        <div className="section-header">
          <h2 id="workspace-heading" className="section-title">
            Tab Workspace
          </h2>
          <span className="section-meta">Tab-Architect</span>
        </div>
        <p className="page-intro">
          Automatically group open tabs by topic, save snapshots, or clear tabs while keeping DICE open.
        </p>
        <div className="workspace-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={onOrganizeTabs}
          >
            Organize My Tabs
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={onSaveWorkspace}
          >
            Save Workspace
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setConfirmClose(true)}
          >
            Save &amp; Close
          </button>
        </div>

        {confirmClose && (
          <div className="confirm-banner" role="alert">
            <p className="confirm-banner-text">
              This will save all unpinned web tabs in this window and close them, while keeping your currently active tab open so the DICE side panel stays available.
            </p>
            <div className="confirm-banner-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => {
                  setConfirmClose(false);
                  onSaveAndClose();
                }}
              >
                Confirm Save &amp; Close
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmClose(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="restore-workspace-heading">
        <div className="section-header">
          <h2 id="restore-workspace-heading" className="section-title">
            Restore Workspace
          </h2>
          <span className="section-meta">{workspaces.length} saved</span>
        </div>

        {workspaces.length === 0 ? (
          <div className="empty-state">
            <h3 className="empty-state-title">No saved workspaces yet</h3>
            <p className="empty-state-text">
              Click Save Workspace or Save &amp; Close above to store your current tab groups locally.
            </p>
          </div>
        ) : (
          <div className="item-list">
            {workspaces.map((ws) => (
              <div key={ws.id} className="saved-item-card">
                <div className="saved-item-top">
                  <div>
                    <div className="saved-item-title">{ws.name}</div>
                    <div className="saved-item-meta">
                      {ws.tabs.length} {ws.tabs.length === 1 ? 'tab' : 'tabs'} ·{' '}
                      {ws.groups.length} {ws.groups.length === 1 ? 'group' : 'groups'} ·{' '}
                      {formatDate(ws.createdAt)}
                    </div>
                  </div>
                </div>
                {ws.groups.length > 0 && (
                  <div className="saved-group-list">
                    {ws.groups.map((grp) => (
                      <div key={grp.name} className="saved-group-item">
                        <div className="saved-group-name">{grp.name}</div>
                        <div className="saved-group-date">
                          {formatGroupCreatedAt(grp.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="saved-item-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    onClick={() => onRestoreWorkspace(ws)}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger-ghost btn-sm"
                    disabled={busy}
                    onClick={() => onDeleteWorkspace(ws.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
