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

  const { summary, leadId, activityType, date } = payload;

  if (!summary) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Summary is required.' }) };
  }

  const fields = {
    'Summary': summary,
    'Activity Type': activityType || 'Note',
    'Date': date || new Date().toISOString(),
    'Logged By': (user && user.email) || 'unknown',
  };
  if (leadId) fields['Linked Lead'] = [leadId];

  try {
    const record = await createRecord(TABLES.ACTIVITIES, fields);
    return { statusCode: 201, body: JSON.stringify(record) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
