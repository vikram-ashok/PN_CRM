// netlify/functions/leads-list.js
//
// GET /api/leads-list?stage=Qualified
// Any authenticated role may list leads. Supports an optional `stage` query
// param to filter by Funnel Stage (used by the Kanban/list view and the
// Dashboard). Team members get exactly the same read-only data as everyone
// else here - the *lockdown* (no edit/export) is enforced in the frontend
// UI (hidden controls) AND in leads-update.js / leads-delete.js (403s).

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
    'sort[0][field]': 'Created Date',
    'sort[0][direction]': 'desc',
  };

  if (params.stage) {
    // Escape double quotes defensively before embedding into the formula.
    const safeStage = String(params.stage).replace(/"/g, '\\"');
    query.filterByFormula = `{Funnel Stage} = "${safeStage}"`;
  }

  try {
    const data = await listRecords(TABLES.LEADS, query);
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
