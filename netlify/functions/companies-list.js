// netlify/functions/companies-list.js
//
// GET /api/companies-list
// Any authenticated role may list companies (read-only lookup data used to
// link leads/deals to a company, and to populate the Lead Detail view).

const { requireRole } = require('./utils/auth');
const { TABLES, listRecords } = require('./utils/airtable');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const denied = await requireRole(event, context, ['team', 'admin', 'superadmin']);
  if (denied) return denied;

  try {
    const data = await listRecords(TABLES.COMPANIES, { pageSize: 100 });
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
