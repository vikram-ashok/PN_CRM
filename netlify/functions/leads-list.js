// netlify/functions/leads-list.js
//
// GET /api/leads-list?stage=Qualified
// Any authenticated role may list leads. Supports an optional `stage` query
// param to filter by Funnel Stage (used by the Kanban/list view and the
// Dashboard). Team members get exactly the same read-only data as everyone
// else here - the *lockdown* (no edit/export) is enforced in the frontend
// UI (hidden controls) AND in leads-update.js / leads-delete.js (403s).

const { requireRole, getUserRole, getUser } = require('./utils/auth');
const { TABLES, listRecords } = require('./utils/airtable');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const denied = await requireRole(event, context, ['team', 'admin', 'superadmin']);
  if (denied) return denied;

  const role = await getUserRole(event, context);
  const user = getUser(context);
  const callerEmail = (user && user.email) || '';

  const params = event.queryStringParameters || {};
  const query = {
    pageSize: 100,
    'sort[0][field]': 'Created Date',
    'sort[0][direction]': 'desc',
  };

  // Build filter conditions. Team members may ONLY see leads they own - this
  // is enforced here server-side (not just hidden in the UI). Admin/Super
  // Admin see everything.
  const conditions = [];
  if (params.stage) {
    const safeStage = String(params.stage).replace(/"/g, '\\"');
    conditions.push(`{Funnel Stage} = "${safeStage}"`);
  }
  if (role === 'team') {
    const safeOwner = String(callerEmail).replace(/"/g, '\\"');
    conditions.push(`{Owner} = "${safeOwner}"`);
  }
  if (conditions.length === 1) {
    query.filterByFormula = conditions[0];
  } else if (conditions.length > 1) {
    query.filterByFormula = `AND(${conditions.join(', ')})`;
  }

  try {
    const data = await listRecords(TABLES.LEADS, query);
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
