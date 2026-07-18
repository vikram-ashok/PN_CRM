// netlify/functions/activities-list.js
//
// GET /api/activities-list?leadId=rec123
// Any authenticated role may list activities. Optional `leadId` filters to
// activities linked to a specific Lead (used by the Lead Detail timeline).

const { requireRole } = require('./utils/auth');
const { TABLES, listRecords } = require('./utils/airtable');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const denied = requireRole(context, ['team', 'admin', 'superadmin']);
  if (denied) return denied;

  const params = event.queryStringParameters || {};
  const query = {
    pageSize: 100,
    'sort[0][field]': 'Date',
    'sort[0][direction]': 'desc',
  };

  if (params.leadId) {
    const safeId = String(params.leadId).replace(/"/g, '\\"');
    query.filterByFormula = `FIND("${safeId}", ARRAYJOIN({Linked Lead}))`;
  }

  try {
    const data = await listRecords(TABLES.ACTIVITIES, query);
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
