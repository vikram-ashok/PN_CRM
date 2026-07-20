// src/pages/Performance.jsx
//
// Per-team-member performance dashboard. Admin/Super Admin see every member;
// a Team member sees only their own row (enforced server-side in
// performance-summary.js - the UI restriction here is just convenience).
//
// A day/week/month selector drives the reporting window; targets scale with
// the window (leads 30/working day; appointments pro-rated from monthly 10).

import React, { useEffect, useMemo, useState } from 'react';
import { api, PERFORMANCE_METRICS } from '../api.js';

// --- date-range helpers (UTC, to match the server's working-day math) ------

function startOfDayUTC(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function rangeFor(period, ref) {
  const base = startOfDayUTC(ref);
  if (period === 'day') {
    const to = new Date(base);
    to.setUTCDate(to.getUTCDate() + 1);
    return { from: base, to };
  }
  if (period === 'week') {
    // ISO week: Monday start.
    const dow = base.getUTCDay(); // 0 Sun..6 Sat
    const mondayOffset = (dow + 6) % 7;
    const from = new Date(base);
    from.setUTCDate(from.getUTCDate() - mondayOffset);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 7);
    return { from, to };
  }
  // month
  const from = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
  const to = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1));
  return { from, to };
}

function shiftRef(period, ref, dir) {
  const d = new Date(ref);
  if (period === 'day') d.setUTCDate(d.getUTCDate() + dir);
  else if (period === 'week') d.setUTCDate(d.getUTCDate() + 7 * dir);
  else d.setUTCMonth(d.getUTCMonth() + dir);
  return d;
}

function fmt(d) {
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function rangeLabel(period, from, to) {
  const end = new Date(to);
  end.setUTCDate(end.getUTCDate() - 1); // inclusive end for display
  if (period === 'day') return fmt(from);
  if (period === 'month') {
    return new Date(from).toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  }
  return `${fmt(from)} - ${fmt(end)}`;
}

const PERIODS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

export default function Performance() {
  const [period, setPeriod] = useState('month');
  const [ref, setRef] = useState(new Date());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { from, to } = useMemo(() => rangeFor(period, ref), [period, ref]);

  useEffect(() => {
    setLoading(true);
    setError('');
    api
      .performanceSummary(from.toISOString(), to.toISOString())
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [from, to]);

  const targetFor = (metric) => (metric.target && data ? data.targets[metric.target] : null);

  return (
    <div className="page-container">
      <h1>Team Performance</h1>

      <div className="perf-controls">
        <div className="perf-period-toggle">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              className={period === p.key ? 'active' : ''}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="perf-nav">
          <button className="secondary" onClick={() => setRef(shiftRef(period, ref, -1))}>&larr; Prev</button>
          <span className="perf-range">{rangeLabel(period, from, to)}</span>
          <button className="secondary" onClick={() => setRef(shiftRef(period, ref, 1))}>Next &rarr;</button>
          <button className="secondary" onClick={() => setRef(new Date())}>Today</button>
        </div>
      </div>

      {data && (
        <p className="muted">
          {data.workingDays} working day{data.workingDays === 1 ? '' : 's'} in range &middot;
          leads target {data.targets.leadsSourced} &middot; appointments target {data.targets.appointments}
          {data.scope === 'self' && ' · showing your own stats'}
        </p>
      )}

      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="loading-spinner">Loading performance...</div>}

      {data && !loading && data.rows.length === 0 && (
        <div className="card"><p className="muted">No activity recorded in this period.</p></div>
      )}

      {data && !loading && data.rows.length > 0 && (
        <div className="perf-table-wrap">
          <table className="perf-table">
            <thead>
              <tr>
                <th className="perf-sticky">Team member</th>
                {PERFORMANCE_METRICS.map((m) => <th key={m.key}>{m.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.email}>
                  <td className="perf-sticky">{row.email}</td>
                  {PERFORMANCE_METRICS.map((m) => {
                    const val = row.metrics[m.key] || 0;
                    const target = targetFor(m);
                    if (target != null) {
                      const hit = val >= target;
                      return (
                        <td key={m.key} className={hit ? 'perf-hit' : 'perf-miss'}>
                          {val} <span className="perf-target">/ {target}</span>
                        </td>
                      );
                    }
                    return <td key={m.key}>{val}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
