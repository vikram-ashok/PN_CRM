// netlify/functions/users-update-role.js
//
// PATCH /api/users-update-role   body: { userId, role }
// Super Admin ONLY - changes an existing user's role via the Identity
// Admin API by overwriting app_metadata.roles.

const { requireRole, VALID_ROLES } = require('./utils/auth');
const { identityRequest } = require('./utils/identity-admin');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'PATCH' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const denied = await requireRole(event, context, ['superadmin']);
  if (denied) return denied;

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { userId, role } = payload;
  if (!userId || !VALID_ROLES.includes(role)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `userId and a valid role (${VALID_ROLES.join(', ')}) are required.` }),
    };
  }

  try {
    const user = await identityRequest(context, `/users/${userId}`, {
      method: 'PUT',
      body: { app_metadata: { roles: [role] } },
    });
    return { statusCode: 200, body: JSON.stringify(user) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
