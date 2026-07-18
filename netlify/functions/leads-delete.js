// netlify/functions/leads-delete.js
//
// DELETE /api/leads-delete
// Only Admin/Super Admin may delete leads. Team is rejected with 403,
// verified server-side against the Identity JWT role claim.

const { requireRole } = require('./utils/auth');
const { TABLES, deleteRecord } = require('./utils/airtable');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'DELETE' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const denied = requireRole(context, ['admin', 'superadmin']);
  if (denied) return denied;

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { recordId } = payload;
  if (!recordId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'recordId is required.' }) };
  }

  try {
    const result = await deleteRecord(TABLES.LEADS, recordId);
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
