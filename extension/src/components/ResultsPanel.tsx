import type { BackendJobResponse } from '../types';

interface ResultsPanelProps {
  job: BackendJobResponse | null;
  isPolling: boolean;
}

export function ResultsPanel({ job, isPolling }: ResultsPanelProps) {
  const synthesis = job?.synthesis ?? null;
  const sources = job?.sources ?? [];

  if (!job) {
    return (
      <section className="card" aria-labelledby="results-preview-heading">
        <div className="section-header">
          <h2 id="results-preview-heading" className="section-title">
            Results Preview
          </h2>
          <span className="section-meta">Empty</span>
        </div>
        <div className="results-stack">
          <div className="results-empty-banner">
            Enter a query and click Start Research to analyze open tabs with the local backend.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="card" aria-labelledby="results-preview-heading">
      <div className="section-header">
        <h2 id="results-preview-heading" className="section-title">
          Research Results
        </h2>
        <span className="section-meta">
          {isPolling ? 'Running…' : job.status}
        </span>
      </div>

      <div className="results-stack">
        {job.error && (
          <div className="results-empty-banner" style={{ color: '#8b2635', borderColor: '#dfb4bc' }}>
            {job.error}
          </div>
        )}

        {isPolling && !synthesis && (
          <div className="results-empty-banner">
            Running Gatekeeper, Scout Swarm, and Ollama Synthesis…
          </div>
        )}

        {synthesis && (
          <>
            <div className="result-section">
              <h3 className="result-section-title">Research Summary</h3>
              <p className="placeholder-text" style={{ color: 'var(--text-primary)' }}>
                {synthesis.summary}
              </p>
            </div>

            {synthesis.findings.length > 0 && (
              <div className="result-section">
                <h3 className="result-section-title">Key Findings</h3>
                {synthesis.findings.map((f, idx) => (
                  <div key={idx} className="result-card-item">
                    <strong style={{ fontSize: 12.5 }}>{f.claim}</strong>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {f.explanation}
                    </span>
                    {f.source_ids.length > 0 && (
                      <div>
                        {f.source_ids.map((sid) => (
                          <span key={sid} className="source-badge">
                            {sid}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="result-section">
              <h3 className="result-section-title">Contradictions</h3>
              {synthesis.contradictions.length === 0 ? (
                <p className="placeholder-text">
                  No major contradictions detected across the fetched sources.
                </p>
              ) : (
                synthesis.contradictions.map((c, idx) => (
                  <div key={idx} className="result-card-item">
                    <strong style={{ fontSize: 12.5 }}>{c.topic}</strong>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      A: {c.position_a}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      B: {c.position_b}
                    </span>
                  </div>
                ))
              )}
            </div>

            {synthesis.takeaways.length > 0 && (
              <div className="result-section">
                <h3 className="result-section-title">Three Takeaways</h3>
                <ul className="result-list">
                  {synthesis.takeaways.slice(0, 3).map((t, idx) => (
                    <li key={idx}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {sources.length > 0 && (
          <div className="result-section">
            <h3 className="result-section-title">
              Source Cards ({sources.length})
            </h3>
            {sources.map((src) => (
              <div key={src.source_id} className="result-card-item">
                <div className="saved-item-top">
                  <strong style={{ fontSize: 12 }}>
                    <span className="source-badge">{src.source_id}</span>
                    {src.title}
                  </strong>
                  <span
                    className={`status-pill${
                      src.status === 'COMPLETED' ? ' is-completed' : ' is-error'
                    }`}
                  >
                    {src.status}
                  </span>
                </div>
                <a
                  className="clip-url"
                  href={src.url}
                  target="_blank"
                  rel="noreferrer"
                  title={src.url}
                >
                  {src.url}
                </a>
                {src.error && (
                  <span style={{ fontSize: 11.5, color: '#8b2635' }}>{src.error}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
