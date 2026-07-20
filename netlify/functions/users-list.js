// netlify/functions/users-list.js
//
// GET /api/users-list
// Super Admin ONLY - lists all Netlify Identity users for the "Manage
// Users" screen. Uses the Identity Admin API (see utils/identity-admin.js).
//
// FALLBACK: if this ever fails in your environment (e.g. missing admin
// token), Vikram can always view/manage users directly in the Netlify UI
// under Site settings > Identity > "Identity" tab - see README.md.

const { requireRole } = require('./utils/auth');
const { identityRequest } = require('./utils/identity-admin');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const denied = requireRole(context, ['superadmin']);
  if (denied) return denied;

  try {
    const data = await identityRequest(context, '/users');
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
