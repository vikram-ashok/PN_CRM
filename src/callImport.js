// src/callImport.js
//
// Pure (React-free) helpers for the "Import Calls" feature so the parsing and
// phone-matching logic can be unit-tested on its own. The UI lives in
// src/pages/ImportCalls.jsx and imports these functions.
//
// Input is a dialer/telephony call report CSV with (at least) these columns:
//   Date, Called To, Duration, Hangup Cause
// Dialers commonly log a misrouted FAILED retry right before the real
// ANSWERED attempt (same number, once without the country code). Normalizing
// every number to its last 10 digits collapses those into one lead, and we
// aggregate to ONE call per number: connected (with duration) if any attempt
// answered, otherwise DNP.

// Minimal RFC-4180-ish CSV parser (quoted fields, commas/newlines inside
// quotes, escaped "" quotes). Mirrors the one in LeadsList.jsx.
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  const s = String(text).replace(/^﻿/, ''); // strip BOM

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

// Reduce any phone string to a comparable key: digits only, with the US "1"
// and Indian "91" country codes stripped, keyed on the last 10 digits.
export function normalizePhone(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  return d.length >= 10 ? d.slice(-10) : d;
}

// Convert a "YYYY-MM-DD HH:MM:SS" dialer timestamp to an ISO-ish string that
// Airtable accepts. (Time zone is taken as-is; the dialer's local time.)
export function toIsoish(d) {
  const s = String(d || '').trim();
  if (!s) return '';
  return s.includes(' ') ? s.replace(' ', 'T') : s;
}

// Parse the report and collapse to one entry per dialed number.
// Returns: [{ normalized, displayNumber, attempts, outcome, duration, date, statuses }]
export function buildCallGroups(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  const col = (name) => headers.indexOf(name);
  const iTo = col('Called To');
  const iDur = col('Duration');
  const iCause = col('Hangup Cause');
  const iDate = col('Date');
  if (iTo < 0) return [];

  const groups = new Map();
  for (const cells of rows.slice(1)) {
    const rawTo = (cells[iTo] || '').trim();
    const norm = normalizePhone(rawTo);
    if (!norm) continue;
    const dur = parseInt(cells[iDur] || '0', 10) || 0;
    const cause = (cells[iCause] || '').trim().toUpperCase();
    const date = (cells[iDate] || '').trim();
    const connected = cause === 'ANSWERED' && dur > 0;

    let g = groups.get(norm);
    if (!g) {
      g = { normalized: norm, displayNumber: rawTo, attempts: 0, connected: false, duration: 0, latestDate: '', connectedDate: '', statuses: {} };
      groups.set(norm, g);
    }
    g.attempts += 1;
    if (cause) g.statuses[cause] = (g.statuses[cause] || 0) + 1;
    // Prefer a full (country-coded) number for display.
    if (rawTo.replace(/\D/g, '').length > g.displayNumber.replace(/\D/g, '').length) g.displayNumber = rawTo;
    if (connected) {
      g.connected = true;
      if (dur > g.duration) { g.duration = dur; g.connectedDate = date; }
    }
    if (date && (!g.latestDate || new Date(date) > new Date(g.latestDate))) g.latestDate = date;
  }

  return [...groups.values()].map((g) => ({
    normalized: g.normalized,
    displayNumber: g.displayNumber,
    attempts: g.attempts,
    outcome: g.connected ? 'Connected' : 'DNP',
    duration: g.connected ? g.duration : 0,
    date: g.connected ? (g.connectedDate || g.latestDate) : g.latestDate,
    statuses: g.statuses,
  }));
}

// Build a normalized-phone -> [lead] index from lead records shaped as
// { id, phone, name, owner }.
export function indexLeadsByPhone(leads) {
  const index = new Map();
  (leads || []).forEach((l) => {
    const key = normalizePhone(l.phone);
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(l);
  });
  return index;
}

// Split call groups into matched / unmatched against a lead phone index.
export function matchGroupsToLeads(groups, leadIndex) {
  const matched = [];
  const unmatched = [];
  (groups || []).forEach((g) => {
    const hits = leadIndex.get(g.normalized) || [];
    if (hits.length === 0) unmatched.push(g);
    else matched.push({ group: g, lead: hits[0], ambiguous: hits.length > 1 });
  });
  return { matched, unmatched };
}

// Human-readable summary line for one call group.
export function summarize(group) {
  if (group.outcome === 'Connected') {
    const secs = group.duration;
    const mmss = `${Math.floor(secs / 60)}m ${secs % 60}s`;
    return `Imported call — connected (${secs}s${secs >= 60 ? `, ${mmss}` : ''})` +
      (group.attempts > 1 ? `, ${group.attempts} attempts` : '');
  }
  const statusList = Object.keys(group.statuses || {}).join(', ').toLowerCase() || 'no connect';
  return `Imported call — no connect (${statusList}); ${group.attempts} attempt${group.attempts > 1 ? 's' : ''}`;
}
