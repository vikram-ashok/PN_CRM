// netlify/functions/calls-import.js
//
// POST /.netlify/functions/calls-import
// Body: { calls: [ { leadId, outcome, duration, date, summary, loggedBy }, ... ] }
//
// Admin / Super Admin ONLY. Bulk-creates "Call" Activity records from a
// parsed dialer report (see src/pages/ImportCalls.jsx). Each entry has already
// been matched to a lead in the browser (matched by phone, or resolved by the
// user in the review step). This function:
//   1. creates one Call Activity per entry (Connected keeps its duration in
//      seconds; everything else is logged as DNP), and
//   2. bumps each affected lead's "Last Activity Date" to the latest call date.
//
// "Logged By" is attributed to the lead's owner (passed per row from the
// server-fetched lead list); it falls back to the caller's email. Team members
// are rejected - bulk call logging is an Admin/Super Admin action.

const { requireRole, getUser } = require('./utils/auth');
const { TABLES, createRecord, updateRecord } = require('./utils/airtable');

const MAX_CALLS = 2000;

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const denied = await requireRole(event, context, ['admin', 'superadmin']);
  if (denied) return denied;

  const caller = getUser(context);
  const callerEmail = (caller && caller.email) || 'unknown';

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const calls = Array.isArray(payload.calls) ? payload.calls : null;
  if (!calls) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body must include a "calls" array.' }) };
  }
  if (calls.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No calls to import.' }) };
  }
  if (calls.length > MAX_CALLS) {
    return { statusCode: 400, body: JSON.stringify({ error: `Too many calls (max ${MAX_CALLS} per import).` }) };
  }

  let created = 0;
  const errors = [];
  // Track the latest call date per lead so we can update Last Activity Date once.
  const latestByLead = new Map();

  for (let i = 0; i < calls.length; i += 1) {
    const c = calls[i] || {};
    const rowNum = i + 1;
    const leadId = (c.leadId || '').trim();

    if (!leadId) {
      errors.push({ row: rowNum, error: 'Missing leadId' });
      continue;
    }

    const outcome = c.outcome === 'Connected' ? 'Connected' : 'DNP';
    const duration = Number(c.duration);
    const date = c.date || new Date().toISOString();

    const fields = {
      'Summary': c.summary || (outcome === 'Connected' ? 'Imported call — connected' : 'Imported call — no connect'),
      'Activity Type': 'Call',
      'Date': date,
      'Logged By': (c.loggedBy || '').trim() || callerEmail,
      'Linked Lead': [leadId],
      'Call Outcome': outcome,
    };
    if (outcome === 'Connected' && Number.isFinite(duration) && duration > 0) {
      fields['Call Duration (s)'] = Math.round(duration);
    }

    try {
      await createRecord(TABLES.ACTIVITIES, fields, { typecast: true });
      created += 1;

      const prev = latestByLead.get(leadId);
      if (!prev || new Date(date) > new Date(prev)) latestByLead.set(leadId, date);
    } catch (err) {
      errors.push({ row: rowNum, error: err.message });
    }
  }

  // Update each affected lead's Last Activity Date to its most recent call.
  const leadUpdateErrors = [];
  for (const [leadId, date] of latestByLead.entries()) {
    try {
      await updateRecord(TABLES.LEADS, leadId, { 'Last Activity Date': date });
    } catch (err) {
      leadUpdateErrors.push({ leadId, error: err.message });
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      created,
      failed: errors.length,
      total: calls.length,
      leadsUpdated: latestByLead.size - leadUpdateErrors.length,
      errors: errors.slice(0, 50),
      leadUpdateErrors: leadUpdateErrors.slice(0, 50),
    }),
  };
};
