// src/pages/Dashboard.jsx
//
// Read-only summary view for ALL roles (including Admin/Super Admin - no
// edit controls live here by design, it's just a pipeline snapshot).
// Shows a count of leads per Funnel Stage.

import React, { useEffect, useState } from 'react';
import { api, FUNNEL_STAGES } from '../api.js';

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .dashboardSummary()
      .then(setSummary)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const maxCount = summary
    ? Math.max(1, ...FUNNEL_STAGES.map((s) => summary.counts[s] || 0))
    : 1;

  return (
    <div className="page-container">
      <h1>Dashboard</h1>
      <p className="muted">Pipeline snapshot - total leads: {summary ? summary.total : '...'}</p>

      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="loading-spinner">Loading dashboard...</div>}

      {summary && (
        <div className="stage-summary-grid">
          {FUNNEL_STAGES.map((stage) => {
            const count = summary.counts[stage] || 0;
            const barHeight = Math.round((count / maxCount) * 60) + 20;
            return (
              <div key={stage} className="card stage-summary-card">
                <div
                  style={{
                    height: barHeight,
                    background: 'var(--pn-primary-light)',
                    borderRadius: 4,
                    margin: '0 auto 0.5rem',
                    width: 24,
                  }}
                  title={`${count} leads`}
                />
                <div className="stage-summary-count">{count}</div>
                <div className="stage-summary-label">{stage}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
