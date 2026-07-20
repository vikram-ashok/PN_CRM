// netlify/functions/deals-update.js
//
// PATCH /api/deals-update
// Only Admin/Super Admin may update deals (e.g. changing Stage, Probability,
// or Deal Value). Team is rejected with 403.

const { requireRole } = require('./utils/auth');
const { TABLES, updateRecord } = require('./utils/airtable');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'PATCH' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

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

  const fieldMap = {
    dealName: 'Deal Name',
    leadId: 'Linked Lead',
    companyId: 'Linked Company',
    dealValue: 'Deal Value',
    expectedCloseDate: 'Expected Close Date',
    probability: 'Probability %',
    stage: 'Stage',
    owner: 'Owner',
  };

  const fields = {};
  Object.entries(updates).forEach(([key, value]) => {
    const airtableField = fieldMap[key];
    if (!airtableField) return;
    if (airtableField === 'Linked Lead' || airtableField === 'Linked Company') {
      fields[airtableField] = value ? [value] : [];
    } else {
      fields[airtableField] = value;
    }
  });

  if (Object.keys(fields).length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No valid fields to update.' }) };
  }

  try {
    const record = await updateRecord(TABLES.DEALS, recordId, fields);
    return { statusCode: 200, body: JSON.stringify(record) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
