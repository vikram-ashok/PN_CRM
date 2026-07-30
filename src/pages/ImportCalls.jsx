// src/pages/ImportCalls.jsx
//
// Admin / Super Admin screen. Upload a dialer call-report CSV; the app matches
// each dialed number to a lead by phone, collapses the dialer's retry noise to
// one call per number, and logs a Call activity (Connected + duration, or DNP)
// against the matched lead. Numbers that match no lead drop into a review
// window where the user can attach them to an existing lead or create a new
// one. Backed by calls-import.js (which re-checks the Admin/Super Admin role
// server-side - this page being reachable is not the security boundary).

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, FUNNEL_STAGES } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { buildCallGroups, indexLeadsByPhone, matchGroupsToLeads, summarize, toIsoish } from '../callImport.js';

function fmtDuration(s) {
  const n = Number(s) || 0;
  if (n < 60) return `${n}s`;
  return `${Math.floor(n / 60)}m ${n % 60}s`;
}

// The columns the parser (buildCallGroups) actually reads from a dialer export.
// Extra columns in a real IP Momentum export are ignored, so this minimal set
// is what matters.
const CALLS_SAMPLE = [
  'Date,Called To,Duration,Hangup Cause',
  // One number dialed 3 times, never answered -> logged as DNP 3.
  '2026-07-20 09:15:00,14155550101,0,NO ANSWER',
  '2026-07-21 10:05:00,14155550101,0,BUSY',
  '2026-07-22 11:30:00,14155550101,0,NO ANSWER',
  // Dialer's misrouted FAILED retry (no country code) + the real ANSWERED
  // attempt (with country code) -> collapsed to ONE connected call (73s).
  '2026-07-20 14:00:00,4155550102,0,FAILED',
  '2026-07-20 14:00:20,14155550102,73,ANSWERED',
  // A single unanswered call -> DNP 1.
  '2026-07-23 16:45:00,14155550103,0,NO ANSWER',
].join('\n');

function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Label for a group's outcome, including the DNP level derived from how many
// times the number was dialed in the report (and the Cold flip past the ladder).
function OutcomeTag({ group }) {
  if (group.outcome === 'Connected') return <span className="activity-tag">Connected</span>;
  if (group.markCold) {
    return <span className="activity-tag" title={`${group.attempts} calls — past the DNP ladder`} style={{ background: 'var(--pn-danger)', color: '#fff' }}>DNP {group.attempts} → Cold</span>;
  }
  return <span className="activity-tag" title={`${group.attempts} call(s) in the report`}>DNP {group.dnpAttempt}</span>;
}

export default function ImportCalls() {
  const { canEdit } = useAuth(); // admin or superadmin
  const navigate = useNavigate();

  const [leads, setLeads] = useState([]);
  const [members, setMembers] = useState([]);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [groups, setGroups] = useState(null);
  const [matched, setMatched] = useState([]);
  const [unmatched, setUnmatched] = useState([]);
  // Resolution per unmatched number: { [normalized]: { action, leadId, name, owner } }
  const [resolutions, setResolutions] = useState({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const leadRows = useCallback(
    () => leads.map((l) => ({ id: l.id, phone: l.fields['Phone'] || '', name: l.fields['Full Name'] || '(no name)', owner: l.fields['Owner'] || '', stage: l.fields['Funnel Stage'] || '' })),
    [leads]
  );

  useEffect(() => {
    if (!canEdit) return;
    api.listLeads().then((d) => setLeads(d.records || [])).catch((e) => setParseError(e.message));
    api.listMembers().then((d) => setMembers(d.members || [])).catch(() => {});
  }, [canEdit]);

  // Re-run matching whenever the parsed groups or the lead list change.
  useEffect(() => {
    if (!groups) return;
    const index = indexLeadsByPhone(leadRows());
    const { matched: m, unmatched: u } = matchGroupsToLeads(groups, index);
    setMatched(m);
    setUnmatched(u);
    // Default every unmatched number to "skip".
    const init = {};
    u.forEach((g) => { init[g.normalized] = { action: 'skip' }; });
    setResolutions(init);
  }, [groups, leadRows]);

  if (!canEdit) {
    return (
      <div className="page-container">
        <div className="error-banner">
          You do not have permission to view this page. Importing call reports is restricted to Admins and Super Admins.
        </div>
      </div>
    );
  }

  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    setParseError(''); setResult(null); setGroups(null); setMatched([]); setUnmatched([]);
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const g = buildCallGroups(String(reader.result));
        if (g.length === 0) { setParseError('No dialed numbers found. Expected columns: Date, Called To, Duration, Hangup Cause.'); return; }
        setGroups(g);
      } catch (err) {
        setParseError('Could not read that CSV: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const setRes = (norm, patch) =>
    setResolutions((prev) => ({ ...prev, [norm]: { ...prev[norm], ...patch } }));

  const connectedCount = matched.filter((m) => m.group.outcome === 'Connected').length +
    unmatched.filter((g) => g.outcome === 'Connected').length;

  const resolvedCount = Object.values(resolutions).filter((r) => r.action && r.action !== 'skip').length;

  const runImport = async () => {
    setImporting(true);
    setParseError('');
    try {
      const calls = [];

      // 1) Auto-matched groups -> log against the matched lead (owner attribution).
      matched.forEach(({ group, lead }) => {
        calls.push({
          leadId: lead.id,
          outcome: group.outcome,
          duration: group.duration,
          date: toIsoish(group.date),
          summary: summarize(group),
          loggedBy: lead.owner || '',
          dnpAttempt: group.dnpAttempt,
          markCold: group.markCold,
          currentStage: lead.stage || '',
        });
      });

      // 2) Unmatched groups the user resolved.
      for (const g of unmatched) {
        const r = resolutions[g.normalized] || { action: 'skip' };
        if (r.action === 'existing' && r.leadId) {
          const lead = leadRows().find((l) => l.id === r.leadId);
          calls.push({
            leadId: r.leadId,
            outcome: g.outcome,
            duration: g.duration,
            date: toIsoish(g.date),
            summary: summarize(g),
            loggedBy: (lead && lead.owner) || '',
            dnpAttempt: g.dnpAttempt,
            markCold: g.markCold,
            currentStage: (lead && lead.stage) || '',
          });
        } else if (r.action === 'new') {
          const name = (r.name || '').trim();
          if (!name) throw new Error(`Enter a name for the new lead for ${g.displayNumber}, or set it to Skip.`);
          const owner = (r.owner || '').trim();
          // Create the lead first, then log the call against it.
          const rec = await api.createLead({
            fullName: name,
            phone: g.displayNumber,
            owner: owner || undefined,
            funnelStage: 'Contacted',
          });
          const newId = rec.id || (rec.record && rec.record.id);
          if (!newId) throw new Error(`Could not create lead for ${g.displayNumber}.`);
          calls.push({
            leadId: newId,
            outcome: g.outcome,
            duration: g.duration,
            date: toIsoish(g.date),
            summary: summarize(g),
            loggedBy: owner || '',
            dnpAttempt: g.dnpAttempt,
            markCold: g.markCold,
            currentStage: 'Contacted', // just created at this stage
          });
        }
        // action === 'skip' -> do nothing
      }

      if (calls.length === 0) {
        setParseError('Nothing to import — every number was skipped.');
        setImporting(false);
        return;
      }

      const res = await api.importCalls(calls);
      setResult(res);
    } catch (err) {
      setParseError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const allLeadRows = leadRows();

  return (
    <div className="page-container">
      <h1>Import Calls</h1>
      <p className="muted" style={{ maxWidth: 720 }}>
        Upload a dialer call report (CSV). Each dialed number is matched to a lead by phone;
        connected calls are logged with their duration, and calls that didn't connect are logged as DNP.
        The <strong>DNP level</strong> reflects how many times the number was dialed in the report
        (2 calls → DNP 2, and so on); a number dialed more than 5 times without connecting marks the
        lead <strong>Cold</strong>. Numbers that don't match any lead appear below for you to attach or add.
      </p>

      {parseError && <div className="error-banner">{parseError}</div>}

      <div className="card" style={{ maxWidth: 560 }}>
        <button type="button" className="secondary" onClick={() => downloadCsv('productnova-calls-sample.csv', CALLS_SAMPLE)}>
          Download sample CSV
        </button>
        <p className="muted" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
          Required columns (header row, exact names): <strong>Date</strong>, <strong>Called To</strong>,
          {' '}<strong>Duration</strong> (seconds), <strong>Hangup Cause</strong> (ANSWERED / BUSY / NO ANSWER / FAILED).
          Any extra columns in your dialer export are ignored.
        </p>
        <div className="form-field" style={{ marginBottom: 0 }}>
          <label>Call report CSV</label>
          <input type="file" accept=".csv,text/csv" onChange={onFile} />
          {fileName && <p className="muted" style={{ marginTop: '0.4rem' }}>{fileName}</p>}
        </div>
      </div>

      {result && (
        <div className="card" style={{ borderLeft: '4px solid var(--pn-success)', marginTop: '1rem' }}>
          <strong>Import complete.</strong> Logged {result.created} call{result.created === 1 ? '' : 's'},
          updated {result.leadsUpdated} lead{result.leadsUpdated === 1 ? '' : 's'}.
          {result.coldMarked > 0 && <span> {result.coldMarked} lead{result.coldMarked === 1 ? '' : 's'} marked Cold.</span>}
          {result.failed > 0 && <span className="perf-miss"> {result.failed} failed.</span>}
          <div style={{ marginTop: '0.6rem' }}>
            <button type="button" onClick={() => navigate('/leads')}>Go to Leads</button>
          </div>
        </div>
      )}

      {groups && !result && (
        <>
          <div className="section-title">Summary</div>
          <div className="card" style={{ maxWidth: 720 }}>
            <p style={{ margin: 0 }}>
              <strong>{groups.length}</strong> unique numbers in this report —{' '}
              <strong>{matched.length}</strong> matched to a lead,{' '}
              <strong>{unmatched.length}</strong> unmatched.{' '}
              {connectedCount} connected, {groups.length - connectedCount} did not connect.
            </p>
          </div>

          <div className="section-title">Matched — will be logged ({matched.length})</div>
          <div className="card" style={{ maxWidth: 900 }}>
            {matched.length === 0 && <p className="muted">No numbers matched an existing lead.</p>}
            {matched.length > 0 && (
              <table className="data-table">
                <thead>
                  <tr><th>Number</th><th>Lead</th><th>Owner</th><th>Outcome</th><th>Duration</th><th>When</th></tr>
                </thead>
                <tbody>
                  {matched.map(({ group, lead, ambiguous }) => (
                    <tr key={group.normalized}>
                      <td>{group.displayNumber}</td>
                      <td>{lead.name}{ambiguous && <span className="activity-tag" title="More than one lead has this number; the first is used.">multiple</span>}</td>
                      <td className="muted">{lead.owner || '—'}</td>
                      <td><OutcomeTag group={group} /></td>
                      <td>{group.outcome === 'Connected' ? fmtDuration(group.duration) : '—'}</td>
                      <td className="muted">{group.date || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {unmatched.length > 0 && (
            <>
              <div className="section-title">Unmatched — review ({unmatched.length})</div>
              <div className="card" style={{ maxWidth: 1000 }}>
                <p className="muted">
                  These numbers didn't match any lead's phone. For each, attach it to an existing lead,
                  create a new lead, or leave it as Skip to ignore it.
                </p>
                <table className="data-table">
                  <thead>
                    <tr><th>Number</th><th>Outcome</th><th>Duration</th><th>Action</th><th>Details</th></tr>
                  </thead>
                  <tbody>
                    {unmatched.map((g) => {
                      const r = resolutions[g.normalized] || { action: 'skip' };
                      return (
                        <tr key={g.normalized}>
                          <td>{g.displayNumber}</td>
                          <td><OutcomeTag group={g} /></td>
                          <td>{g.outcome === 'Connected' ? fmtDuration(g.duration) : '—'}</td>
                          <td>
                            <select value={r.action} onChange={(e) => setRes(g.normalized, { action: e.target.value })}>
                              <option value="skip">Skip</option>
                              <option value="existing">Match to existing lead</option>
                              <option value="new">Create new lead</option>
                            </select>
                          </td>
                          <td>
                            {r.action === 'existing' && (
                              <select value={r.leadId || ''} onChange={(e) => setRes(g.normalized, { leadId: e.target.value })}>
                                <option value="">-- pick a lead --</option>
                                {allLeadRows.map((l) => (
                                  <option key={l.id} value={l.id}>{l.name}{l.phone ? ` — ${l.phone}` : ''}</option>
                                ))}
                              </select>
                            )}
                            {r.action === 'new' && (
                              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <input
                                  placeholder="New lead name"
                                  value={r.name || ''}
                                  onChange={(e) => setRes(g.normalized, { name: e.target.value })}
                                />
                                <select value={r.owner || ''} onChange={(e) => setRes(g.normalized, { owner: e.target.value })}>
                                  <option value="">Owner: me</option>
                                  {members.map((m) => (
                                    <option key={m.email} value={m.email}>{m.name} ({m.email})</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button type="button" onClick={runImport} disabled={importing}>
              {importing ? 'Importing…' : `Import ${matched.length + resolvedCount} call${matched.length + resolvedCount === 1 ? '' : 's'}`}
            </button>
            <span className="muted">
              {matched.length} matched{resolvedCount > 0 ? ` + ${resolvedCount} resolved` : ''}
              {unmatched.length - resolvedCount > 0 ? `, ${unmatched.length - resolvedCount} skipped` : ''}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
