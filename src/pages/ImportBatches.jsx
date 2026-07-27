// src/pages/ImportBatches.jsx
//
// Admin / Super Admin screen to review Bulk-Import batches and clean up bad
// ones. Each row in the batch table is one import (who ran it, when, filename,
// how many leads). Expanding a batch loads that batch's leads with a checkbox
// per lead, so the admin can delete a whole messy import - or leave behind the
// few rows that have since been worked.
//
// A lead is flagged "worked" if it has moved past "New Lead", or has any
// logged activities or linked deals. Those are pre-left-unchecked when you
// "Select untouched", so real progress isn't wiped by accident. Everything is
// still the admin's call - they can tick anything they like.
//
// Access: the backend (import-batches-list / leads-bulk-delete) is Admin/Super
// Admin only; this page also guards in the UI for a friendlier message.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

function fmtDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// Is this lead "worked"? Advanced past New Lead, or has activities/deals.
function isWorked(lead) {
  const f = lead.fields || {};
  const stage = f['Funnel Stage'];
  const activities = (f['Activities'] || []).length;
  const deals = (f['Deals'] || []).length;
  return (!!stage && stage !== 'New Lead') || activities > 0 || deals > 0;
}

function BatchLeads({ batch, memberName, onDeleted }) {
  const batchId = batch.fields['Batch ID'];
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    setError(''); setNotice('');
    api.listBatchLeads(batchId)
      .then((data) => {
        const recs = data.records || [];
        setLeads(recs);
        // Default selection: the untouched leads (the safe-to-delete ones).
        setSelected(new Set(recs.filter((l) => !isWorked(l)).map((l) => l.id)));
      })
      .catch((err) => setError(err.message));
  }, [batchId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selectAll = () => setLeads((cur) => { setSelected(new Set((cur || []).map((l) => l.id))); return cur; });
  const selectNone = () => setSelected(new Set());
  const selectUntouched = () => setSelected(new Set((leads || []).filter((l) => !isWorked(l)).map((l) => l.id)));

  const runDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const workedCount = (leads || []).filter((l) => selected.has(l.id) && isWorked(l)).length;
    const warn = workedCount > 0
      ? `\n\nWARNING: ${workedCount} of these ${ids.length} lead(s) have already been worked (advanced stage, activities, or deals). They will be permanently deleted too.`
      : '';
    if (!window.confirm(`Delete ${ids.length} lead(s) from this import? This cannot be undone.${warn}`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await api.bulkDeleteLeads(ids, batchId);
      setNotice(`Deleted ${res.deleted} lead(s)${res.failed ? `, ${res.failed} failed` : ''}.`);
      if (res.batchRemoved) {
        onDeleted({ removed: true }); // whole batch gone - parent will drop it
        return;
      }
      onDeleted({ removed: false });
      load(); // refresh remaining leads
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="error-banner" style={{ margin: '0.5rem 0' }}>{error}</div>;
  if (!leads) return <div className="muted" style={{ padding: '0.5rem' }}>Loading batch leads...</div>;

  if (leads.length === 0) {
    return <div className="muted" style={{ padding: '0.5rem' }}>No leads remain in this batch (they may have already been deleted).</div>;
  }

  const workedTotal = leads.filter(isWorked).length;

  return (
    <div style={{ padding: '0.5rem 0' }}>
      {notice && <div className="card" style={{ marginBottom: '0.5rem' }}>{notice}</div>}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <button className="secondary" type="button" onClick={selectUntouched}>Select untouched</button>
        <button className="secondary" type="button" onClick={selectAll}>Select all</button>
        <button className="secondary" type="button" onClick={selectNone}>Clear</button>
        <span className="muted">
          {selected.size} of {leads.length} selected
          {workedTotal > 0 && ` · ${workedTotal} worked lead(s) in this batch`}
        </span>
        <button className="danger" type="button" disabled={busy || selected.size === 0} onClick={runDelete} style={{ marginLeft: 'auto' }}>
          {busy ? 'Deleting...' : `Delete selected (${selected.size})`}
        </button>
      </div>

      <div className="perf-table-wrap">
        <table className="perf-table leads-table">
          <thead>
            <tr>
              <th style={{ width: '2rem' }}></th>
              <th className="perf-sticky">Lead Name</th>
              <th>Funnel Stage</th>
              <th>Owner</th>
              <th>Sourced By</th>
              <th>Activities</th>
              <th>Deals</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const worked = isWorked(l);
              const acts = (l.fields['Activities'] || []).length;
              const deals = (l.fields['Deals'] || []).length;
              return (
                <tr key={l.id} style={worked ? { background: 'var(--pn-bg-alt, #fff8f0)' } : undefined}>
                  <td>
                    <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} style={{ width: 'auto' }} />
                  </td>
                  <td className="perf-sticky"><Link to={`/leads/${l.id}`}>{l.fields['Full Name'] || '(no name)'}</Link></td>
                  <td>{l.fields['Funnel Stage'] || '-'}</td>
                  <td>{memberName(l.fields['Owner']) || '-'}</td>
                  <td>{memberName(l.fields['Sourced By']) || '-'}</td>
                  <td>{acts || '-'}</td>
                  <td>{deals || '-'}</td>
                  <td>{worked ? <span className="activity-tag">Worked</span> : <span className="muted">Untouched</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ImportBatches() {
  const { canEdit } = useAuth();
  const [batches, setBatches] = useState([]);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.listImportBatches()
      .then((data) => setBatches(data.records || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    api.listMembers().then((data) => setMembers(data.members || [])).catch(() => {});
  }, []);

  useEffect(() => { if (canEdit) load(); }, [canEdit, load]);

  const memberNameByEmail = useMemo(() => {
    const m = {};
    members.forEach((mem) => { m[mem.email] = mem.name; });
    return m;
  }, [members]);

  const memberName = useCallback((email) => (email ? (memberNameByEmail[email] || email) : ''), [memberNameByEmail]);

  const onDeleted = useCallback(({ removed }) => {
    // A delete changed the leads - refresh the batch list (counts, or drop an
    // emptied batch). Collapse the panel if the whole batch is gone.
    if (removed) setOpenId(null);
    load();
  }, [load]);

  if (!canEdit) {
    return (
      <div className="page-container">
        <h1>Import Batches</h1>
        <p className="muted">This screen is available to Admins and Super Admins only.</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>Import Batches</h1>
        <div className="toolbar-actions">
          <button className="secondary" onClick={load}>Refresh</button>
        </div>
      </div>
      <p className="muted">
        Each row is one bulk import. Expand a batch to review its leads and delete the whole
        import (or just the untouched rows) if the data came in wrong.
      </p>

      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="loading-spinner">Loading imports...</div>}

      {!loading && (
        <div className="perf-table-wrap">
          <table className="perf-table">
            <thead>
              <tr>
                <th>Imported</th>
                <th>By</th>
                <th>File</th>
                <th>Leads</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const id = b.id;
                const isOpen = openId === id;
                return (
                  <React.Fragment key={id}>
                    <tr>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(b.fields['Imported At'])}</td>
                      <td>{memberName(b.fields['Imported By']) || '-'}</td>
                      <td>{b.fields['File Name'] || <span className="muted">(no filename)</span>}</td>
                      <td>{b.fields['Lead Count'] ?? '-'}</td>
                      <td>
                        <button className="secondary" onClick={() => setOpenId(isOpen ? null : id)}>
                          {isOpen ? 'Hide' : 'Review / delete'}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={5} style={{ background: 'var(--pn-bg, #f7f7f8)' }}>
                          <BatchLeads batch={b} memberName={memberName} onDeleted={onDeleted} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {batches.length === 0 && (
                <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: '1.5rem' }}>
                  No bulk imports yet. Imports done from the Leads page will appear here.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
