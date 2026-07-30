// netlify/functions/calls-import.js
//
// POST /.netlify/functions/calls-import
// Body: { calls: [ { leadId, outcome, duration, date, summary, loggedBy,
//                    dnpAttempt, markCold }, ... ] }
//
// dnpAttempt (1-5): the DNP level derived in the browser from how many times
//   the number was dialed in the report (2 calls => DNP 2, etc.).
// markCold: when a number was dialed past the DNP ladder (>5 unanswered), the
//   lead is set to Funnel Stage "Cold" and its Next Contact Date is cleared.
// currentStage: the matched lead's current Funnel Stage (from the client), used
//   so a Connected call advances a "New Lead" to "Contacted" without regressing
//   a lead that's already further along.
// A Connected call → lead advanced to "Contacted" (from New Lead). A DNP call →
//   Next Contact Date set to the call date + 1 day (DNP 1-3) or +3 days (4-5).
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

// DNP callback cadence: attempts 1-3 → next day, 4-5 → +3 days (measured from
// the call date). Mirrors the manual Log-Activity flow in LeadDetail.jsx.
function dnpIntervalDays(attempt) {
  const n = Number(attempt) || 1;
  return n <= 3 ? 1 : 3;
}
function addDays(isoDate, days) {
  const base = String(isoDate || '').slice(0, 10);
  const d = new Date(`${base}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

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
  // Leads to mark Cold (dialed past the DNP ladder), applied after logging.
  const coldLeads = new Set();
  // Leads a connected call should advance New Lead -> Contacted (only when the
  // client tells us the lead is currently New Lead, so we never regress one).
  const contactLeads = new Set();
  // Leads that need a DNP callback date: leadId -> { date, attempt }.
  const dnpNext = new Map();

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
    // DNP level derived from the number of calls in the report (1-5).
    if (outcome === 'DNP') {
      const n = Number(c.dnpAttempt);
      if (Number.isFinite(n) && n >= 1 && n <= 5) fields['DNP Attempt'] = Math.round(n);
    }

    try {
      await createRecord(TABLES.ACTIVITIES, fields, { typecast: true });
      created += 1;

      // Dialed past the DNP ladder -> flag the lead to be marked Cold below.
      if (outcome === 'DNP' && c.markCold === true) coldLeads.add(leadId);
      // A connected call means we reached them -> advance a New Lead to Contacted.
      if (outcome === 'Connected' && c.currentStage === 'New Lead') contactLeads.add(leadId);
      // A DNP (not past the ladder) schedules the next-day / +3-day callback.
      if (outcome === 'DNP' && c.markCold !== true) {
        const nc = addDays(date, dnpIntervalDays(c.dnpAttempt));
        if (nc) dnpNext.set(leadId, { date: nc, attempt: Number(c.dnpAttempt) || 1 });
      }

      const prev = latestByLead.get(leadId);
      if (!prev || new Date(date) > new Date(prev)) latestByLead.set(leadId, date);
    } catch (err) {
      errors.push({ row: rowNum, error: err.message });
    }
  }

  // Update each affected lead's Last Activity Date to its most recent call.
  // Leads dialed past the DNP ladder are also set to Cold (and their pending
  // callback cleared) in the same write.
  const leadUpdateErrors = [];
  for (const [leadId, date] of latestByLead.entries()) {
    const fields = { 'Last Activity Date': date };
    if (coldLeads.has(leadId)) {
      fields['Funnel Stage'] = 'Cold';
      fields['Next Contact Date'] = null;
    } else {
      if (contactLeads.has(leadId)) fields['Funnel Stage'] = 'Contacted';
      const nx = dnpNext.get(leadId);
      if (nx) {
        fields['Next Contact Date'] = nx.date;
        fields['Next Contact Note'] = `Auto follow-up: retry after DNP ${nx.attempt}`;
      }
    }
    try {
      // typecast so the "Cold" Funnel Stage option registers on first use.
      await updateRecord(TABLES.LEADS, leadId, fields, { typecast: true });
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
      coldMarked: coldLeads.size,
      errors: errors.slice(0, 50),
      leadUpdateErrors: leadUpdateErrors.slice(0, 50),
    }),
  };
};
