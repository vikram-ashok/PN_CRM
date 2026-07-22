// netlify/functions/activities-create.js
//
// POST /api/activities-create
// Any authenticated role may log an activity (call/email/meeting/note)
// against a lead - this is normal day-to-day CRM usage for Team members too.
// "Logged By" is stamped from the verified Identity user, not client input.

const { requireRole, getUser } = require('./utils/auth');
const { TABLES, createRecord } = require('./utils/airtable');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const denied = await requireRole(event, context, ['team', 'admin', 'superadmin']);
  if (denied) return denied;

  const user = getUser(context);

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const {
    summary, leadId, activityType, date, callOutcome, isFollowUp,
    emailEvent, dnpAttempt, messageContent, linkedinEvent,
  } = payload;

  if (!summary) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Summary is required.' }) };
  }

  const type = activityType || 'Note';
  const LINKEDIN_EVENTS = ['Request Sent', 'Accepted', 'Message Sent', 'Read', 'Replied'];

  const fields = {
    'Summary': summary,
    'Activity Type': type,
    'Date': date || new Date().toISOString(),
    'Logged By': (user && user.email) || 'unknown',
  };
  if (leadId) fields['Linked Lead'] = [leadId];

  // Performance-tracking metadata (only meaningful for the relevant type).
  if (type === 'Call' && (callOutcome === 'Connected' || callOutcome === 'DNP')) {
    fields['Call Outcome'] = callOutcome;
    // DNP attempt number (1-5) - only meaningful on an unanswered call.
    if (callOutcome === 'DNP') {
      const n = Number(dnpAttempt);
      if (Number.isFinite(n) && n >= 1 && n <= 5) fields['DNP Attempt'] = Math.round(n);
    }
  }
  if (type === 'Email' && ['Sent', 'Opened', 'Replied'].includes(emailEvent)) {
    fields['Email Event'] = emailEvent;
  }
  if (type === 'LinkedIn' && LINKEDIN_EVENTS.includes(linkedinEvent)) {
    fields['LinkedIn Event'] = linkedinEvent;
  }
  // Follow-up flag applies to the outreach types (calls, emails, LinkedIn msgs).
  if ((type === 'Call' || type === 'Email' || type === 'LinkedIn') && isFollowUp) {
    fields['Is Follow-Up'] = true;
  }
  // Message body / reply text - for Email and LinkedIn entries.
  if ((type === 'Email' || type === 'LinkedIn') && messageContent) {
    fields['Message Content'] = messageContent;
  }

  try {
    // typecast so a new "LinkedIn" Activity Type option registers on first use.
    const record = await createRecord(TABLES.ACTIVITIES, fields, { typecast: true });
    return { statusCode: 201, body: JSON.stringify(record) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
