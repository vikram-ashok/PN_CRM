// netlify/functions/performance-summary.js
//
// GET /.netlify/functions/performance-summary?from=<ISO>&to=<ISO>
//
// Per-team-member performance metrics for a date range, with targets that
// scale to the selected period. Access model:
//   - team           -> may only see their OWN row (server forces this,
//                        regardless of any query param)
//   - admin/superadmin -> see every member who has data in the range
//
// Targets (working days = Mon-Fri):
//   - Leads sourced target      = 30 per working day in range
//   - Appointments target       = the monthly quota of 10, pro-rated by
//                                  working days (so a ~5-working-day week
//                                  lands around 2-3, a full month = 10)

const { requireRole, getUserRole, getUser } = require('./utils/auth');
const { TABLES, listRecords } = require('./utils/airtable');

const LEADS_PER_WORKING_DAY = 30;
const APPTS_PER_MONTH = 10;

function isWorkingDay(d) {
  const day = d.getUTCDay(); // 0 Sun ... 6 Sat
  return day >= 1 && day <= 5;
}

// Count Mon-Fri days in [from, to) using date-only (UTC) stepping.
function workingDaysInRange(from, to) {
  let count = 0;
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (d < end) {
    if (isWorkingDay(d)) count += 1;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

function workingDaysInMonth(year, month /* 0-based */) {
  let count = 0;
  const d = new Date(Date.UTC(year, month, 1));
  while (d.getUTCMonth() === month) {
    if (isWorkingDay(d)) count += 1;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

// Appointment target: sum, over each working day in range, of that month's
// per-working-day appointment quota (10 / working days in that month).
function appointmentsTarget(from, to) {
  let total = 0;
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (d < end) {
    if (isWorkingDay(d)) {
      const wdm = workingDaysInMonth(d.getUTCFullYear(), d.getUTCMonth()) || 1;
      total += APPTS_PER_MONTH / wdm;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return total;
}

async function fetchAll(tableId) {
  const out = [];
  let offset;
  do {
    const data = await listRecords(tableId, { pageSize: 100, offset });
    (data.records || []).forEach((r) => out.push(r));
    offset = data.offset;
  } while (offset);
  return out;
}

function emptyMetrics() {
  return {
    leadsSourced: 0,
    appointments: 0,
    callsMade: 0,
    callsConnected: 0,
    dnps: 0,
    followUpCalls: 0,
    emailsSent: 0,
    emailsOpened: 0,
    followUpEmails: 0,
    emailReplies: 0,
  };
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const denied = await requireRole(event, context, ['team', 'admin', 'superadmin']);
  if (denied) return denied;

  const role = await getUserRole(event, context);
  const caller = getUser(context); // cached verified user from requireRole above
  const callerEmail = (caller && caller.email) || '';

  const params = (event.queryStringParameters) || {};
  // Default range: current month (UTC) if not supplied.
  const now = new Date();
  const from = params.from ? new Date(params.from) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = params.to ? new Date(params.to) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid from/to range.' }) };
  }

  const inRange = (iso) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= from.getTime() && t < to.getTime();
  };

  const isTeam = role === 'team';

  try {
    const [leads, activities] = await Promise.all([
      fetchAll(TABLES.LEADS),
      fetchAll(TABLES.ACTIVITIES),
    ]);

    const members = {}; // email -> metrics
    const ensure = (email) => {
      if (!email) return null;
      if (isTeam && email.toLowerCase() !== callerEmail.toLowerCase()) return null;
      if (!members[email]) members[email] = emptyMetrics();
      return members[email];
    };

    // Leads sourced (by Owner, Created Date in range)
    leads.forEach((r) => {
      const f = r.fields || {};
      if (!inRange(f['Created Date'])) return;
      const m = ensure(f['Owner']);
      if (m) m.leadsSourced += 1;
    });

    // Activity-derived metrics (by Logged By, Date in range)
    activities.forEach((r) => {
      const f = r.fields || {};
      if (!inRange(f['Date'])) return;
      const m = ensure(f['Logged By']);
      if (!m) return;
      const type = f['Activity Type'];
      const followUp = f['Is Follow-Up'] === true;

      if (type === 'Meeting') {
        m.appointments += 1;
      } else if (type === 'Call') {
        m.callsMade += 1;
        if (f['Call Outcome'] === 'Connected') m.callsConnected += 1;
        if (f['Call Outcome'] === 'DNP') m.dnps += 1;
        if (followUp) m.followUpCalls += 1;
      } else if (type === 'Email') {
        const ev = f['Email Event'];
        // Legacy emails (no event) count as "Sent".
        const isSent = ev === 'Sent' || ev == null || ev === '';
        if (isSent) {
          m.emailsSent += 1;
          if (followUp) m.followUpEmails += 1;
        }
        if (ev === 'Opened') m.emailsOpened += 1;
        if (ev === 'Replied') m.emailReplies += 1;
      }
    });

    // Make sure the team caller always appears (even with zero activity).
    if (isTeam && callerEmail) ensure(callerEmail);

    const workingDays = workingDaysInRange(from, to);
    const targets = {
      leadsSourced: LEADS_PER_WORKING_DAY * workingDays,
      appointments: Math.round(appointmentsTarget(from, to)),
    };

    const rows = Object.keys(members)
      .sort()
      .map((email) => ({ email, metrics: members[email] }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        from: from.toISOString(),
        to: to.toISOString(),
        workingDays,
        targets,
        scope: isTeam ? 'self' : 'all',
        rows,
      }),
    };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
