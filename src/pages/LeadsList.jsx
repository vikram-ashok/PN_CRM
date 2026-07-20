// src/pages/LeadsList.jsx
//
// Leads table view (columns: Lead Name, Company, Email, Phone, Lead Source,
// Lead Owner) with client-side search, Create Lead, and Bulk Import.
//
// Role behaviour:
//  - Team: the API (leads-list.js) already returns ONLY leads they own, so
//    this table is naturally scoped. Team sees no Export / Delete controls
//    (RoleGate), consistent with the copy/export lockdown.
//  - Admin / Super Admin: see all leads, plus Export CSV and per-row Delete.
//  - Bulk import is available to every role (Team included), per product req.

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import RoleGate from '../components/RoleGate.jsx';

// --- CSV helpers ------------------------------------------------------------

const SAMPLE_HEADERS = [
  'Full Name', 'Email', 'Phone', 'Company', 'Lead Source', 'Funnel Stage',
  'Owner', 'Source / Campaign Detail', 'Notes',
];

// Map a (lowercased, trimmed) CSV header to our payload field name.
const HEADER_TO_FIELD = {
  'full name': 'fullName',
  'name': 'fullName',
  'email': 'email',
  'phone': 'phone',
  'company': 'companyName',
  'company name': 'companyName',
  'lead source': 'leadSource',
  'source': 'leadSource',
  'funnel stage': 'funnelStage',
  'stage': 'funnelStage',
  'owner': 'owner',
  'lead owner': 'owner',
  'source / campaign detail': 'sourceCampaignDetail',
  'source/campaign detail': 'sourceCampaignDetail',
  'campaign detail': 'sourceCampaignDetail',
  'notes': 'notes',
};

// Minimal RFC-4180-ish CSV parser (handles quoted fields, commas, newlines,
// and escaped "" quotes). Good enough for hand-made / exported lead CSVs.
function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  const s = text.replace(/^﻿/, ''); // strip BOM

  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((v) => v !== '')) rows.push(row); }
  return rows;
}

function csvToRowObjects(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => HEADER_TO_FIELD[h.trim().toLowerCase()] || null);
  return rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((key, idx) => { if (key) obj[key] = (cells[idx] || '').trim(); });
    return obj;
  });
}

function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportToCsv(leads, companyName, ownerName) {
  const headers = ['Full Name', 'Company', 'Email', 'Phone', 'Lead Source', 'Funnel Stage', 'Lead Owner'];
  const rows = leads.map((l) => [
    l.fields['Full Name'] || '',
    companyName(l) || '',
    l.fields['Email'] || '',
    l.fields['Phone'] || '',
    l.fields['Lead Source'] || '',
    l.fields['Funnel Stage'] || '',
    ownerName(l.fields['Owner']) || '',
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  downloadCsv(`productnova-leads-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}

// --- Bulk import modal ------------------------------------------------------

function BulkImportModal({ onClose, onDone }) {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const sample = [
    SAMPLE_HEADERS.join(','),
    '"Jane Doe","jane@example.com","555-0100","Acme Corp","LinkedIn","New Lead","","Q3 LinkedIn campaign","Met at webinar"',
    '"Ravi Kumar","ravi@example.in","555-0111","Globex","Referral","Contacted","","Partner intro","Wants a demo"',
  ].join('\n');

  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    setParseError(''); setResult(null); setRows(null);
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = csvToRowObjects(String(reader.result));
        if (parsed.length === 0) { setParseError('No data rows found. Make sure the first row is a header.'); return; }
        const withName = parsed.filter((r) => r.fullName);
        if (withName.length === 0) { setParseError('No rows have a Full Name. Check your column headers.'); return; }
        setRows(parsed);
      } catch (err) { setParseError('Could not read that CSV: ' + err.message); }
    };
    reader.readAsText(file);
  };

  const runImport = async () => {
    if (!rows) return;
    setImporting(true);
    try {
      const res = await api.importLeads(rows);
      setResult(res);
      if (res.created > 0) onDone();
    } catch (err) {
      setParseError(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Bulk import leads</h2>
        <p className="muted">
          Upload a CSV with a header row. Only <strong>Full Name</strong> is required; other
          columns are optional. New company names are created automatically.
        </p>

        <button className="secondary" onClick={() => downloadCsv('productnova-leads-sample.csv', sample)}>
          Download sample CSV
        </button>

        <div className="form-field" style={{ marginTop: '1rem' }}>
          <label>Choose CSV file</label>
          <input type="file" accept=".csv,text/csv" onChange={onFile} />
          {fileName && !parseError && rows && (
            <p className="muted">{fileName}: {rows.length} row{rows.length === 1 ? '' : 's'} ready to import.</p>
          )}
        </div>

        {parseError && <div className="error-banner">{parseError}</div>}

        {result && (
          <div className="card" style={{ marginTop: '0.5rem' }}>
            <p><strong>{result.created}</strong> created, <strong>{result.failed}</strong> failed (of {result.total}).</p>
            {result.errors && result.errors.length > 0 && (
              <ul className="muted" style={{ margin: 0, paddingLeft: '1.2rem' }}>
                {result.errors.map((e, i) => <li key={i}>Row {e.row}: {e.error}</li>)}
              </ul>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button onClick={runImport} disabled={!rows || importing}>
            {importing ? 'Importing...' : `Import ${rows ? rows.length : ''} leads`}
          </button>
          <button className="secondary" onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
        </div>
      </div>
    </div>
  );
}

// --- Leads table page -------------------------------------------------------

export default function LeadsList() {
  const { canEdit } = useAuth();
  const [leads, setLeads] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.listLeads()
      .then((data) => setLeads(data.records || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    api.listCompanies().then((data) => setCompanies(data.records || [])).catch(() => {});
    api.listMembers().then((data) => setMembers(data.members || [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const companyById = useMemo(() => {
    const m = {};
    companies.forEach((c) => { m[c.id] = c.fields['Company Name']; });
    return m;
  }, [companies]);

  const ownerNameByEmail = useMemo(() => {
    const m = {};
    members.forEach((mem) => { m[mem.email] = mem.name; });
    return m;
  }, [members]);

  const companyName = useCallback((lead) => {
    const linked = lead.fields['Company'];
    if (!linked || !linked.length) return '';
    return companyById[linked[0]] || '';
  }, [companyById]);

  const ownerName = useCallback((email) => (email ? (ownerNameByEmail[email] || email) : ''), [ownerNameByEmail]);

  const handleDelete = async (recordId) => {
    if (!window.confirm('Delete this lead? This cannot be undone.')) return;
    try { await api.deleteLead(recordId); load(); }
    catch (err) { setError(err.message); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) => {
      const hay = [
        l.fields['Full Name'], companyName(l), l.fields['Email'], l.fields['Phone'],
        l.fields['Lead Source'], ownerName(l.fields['Owner']), l.fields['Funnel Stage'],
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [leads, search, companyName, ownerName]);

  return (
    <div className="page-container">
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>Leads</h1>
        <div className="toolbar-actions">
          <input
            className="search-input"
            placeholder="Search leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="secondary" onClick={() => setShowImport(true)}>Bulk Import</button>
          <RoleGate allow={['admin', 'superadmin']}>
            <button className="secondary" onClick={() => exportToCsv(filtered, companyName, ownerName)}>Export CSV</button>
          </RoleGate>
          <Link to="/leads/new"><button>Create Lead</button></Link>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="loading-spinner">Loading leads...</div>}

      {!loading && (
        <div className="perf-table-wrap">
          <table className="perf-table leads-table">
            <thead>
              <tr>
                <th className="perf-sticky">Lead Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Lead Source</th>
                <th>Funnel Stage</th>
                <th>Lead Owner</th>
                <RoleGate allow={['admin', 'superadmin']}><th></th></RoleGate>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => (
                <tr key={lead.id}>
                  <td className="perf-sticky"><Link to={`/leads/${lead.id}`}>{lead.fields['Full Name']}</Link></td>
                  <td>{companyName(lead) || '-'}</td>
                  <td>{lead.fields['Email'] || '-'}</td>
                  <td>{lead.fields['Phone'] || '-'}</td>
                  <td>{lead.fields['Lead Source'] || '-'}</td>
                  <td>{lead.fields['Funnel Stage'] || '-'}</td>
                  <td>{ownerName(lead.fields['Owner']) || 'Unassigned'}</td>
                  <RoleGate allow={['admin', 'superadmin']}>
                    <td>
                      <button className="danger" onClick={() => handleDelete(lead.id)} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
                        Delete
                      </button>
                    </td>
                  </RoleGate>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: '1.5rem' }}>
                  {search ? 'No leads match your search.' : 'No leads yet.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!canEdit && (
        <p className="muted" style={{ marginTop: '1rem' }}>
          You see only the leads you own. You can create and import leads, but cannot edit, delete, or export existing records.
        </p>
      )}

      {showImport && <BulkImportModal onClose={() => setShowImport(false)} onDone={load} />}
    </div>
  );
}
