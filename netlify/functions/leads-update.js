// netlify/functions/leads-update.js
//
// PATCH /api/leads-update
// CORE RULE ENFORCEMENT: Team members can create leads but can NEVER edit
// them once created - not the fields, and not the Funnel Stage (moving a
// lead between stages, including into/out of Nurture, counts as an edit).
// This check happens here, server-side, against the verified Identity JWT
// role claim - it does NOT trust any role field in the request body.

const { requireRole } = require('./utils/auth');
const { TABLES, updateRecord } = require('./utils/airtable');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'PATCH' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Reject "team" (and any unauthenticated caller) with 403/401. Only
  // admin/superadmin may reach the Airtable update call below.
  const denied = await requireRole(event, context, ['admin', 'superadmin']);
  if (denied) return denied;

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { recordId, ...updates } = payload;
  if (!recordId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'recordId is required.' }) };
  }

  // Map friendly payload keys to exact Airtable field names.
  const fieldMap = {
    fullName: 'Full Name',
    email: 'Email',
    phone: 'Phone',
    leadSource: 'Lead Source',
    sourceCampaignDetail: 'Source / Campaign Detail',
    funnelStage: 'Funnel Stage',
    owner: 'Owner',
    notes: 'Notes',
    lastActivityDate: 'Last Activity Date',
    lostReason: 'Lost Reason',
    companyId: 'Company',
  };

  const fields = {};
  Object.entries(updates).forEach(([key, value]) => {
    const airtableField = fieldMap[key];
    if (!airtableField) return; // ignore unknown keys
    if (airtableField === 'Company') {
      fields[airtableField] = value ? [value] : [];
    } else {
      fields[airtableField] = value;
    }
  });

  if (Object.keys(fields).length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No valid fields to update.' }) };
  }

  try {
    const record = await updateRecord(TABLES.LEADS, recordId, fields);
    return { statusCode: 200, body: JSON.stringify(record) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
