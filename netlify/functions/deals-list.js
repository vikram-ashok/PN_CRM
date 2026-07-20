// netlify/functions/deals-list.js
//
// GET /api/deals-list?leadId=rec123
// Any authenticated role may list deals. Optional `leadId` query param
// filters deals linked to a specific Lead (used by the Lead Detail page).

const { requireRole } = require('./utils/auth');
const { TABLES, listRecords } = require('./utils/airtable');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const denied = await requireRole(event, context, ['team', 'admin', 'superadmin']);
  if (denied) return denied;

  const params = event.queryStringParameters || {};
  const query = { pageSize: 100 };

  if (params.leadId) {
    const safeId = String(params.leadId).replace(/"/g, '\\"');
    query.filterByFormula = `FIND("${safeId}", ARRAYJOIN({Linked Lead}))`;
  }

  try {
    const data = await listRecords(TABLES.DEALS, query);
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
