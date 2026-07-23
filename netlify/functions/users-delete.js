// netlify/functions/users-delete.js
//
// DELETE /api/users-delete   body: { userId }
// Super Admin ONLY - permanently deletes a user from Netlify Identity via
// the Identity Admin API (DELETE /admin/users/{id}). Like every other admin
// function, this re-verifies the caller's role server-side; the UI hiding
// the button is NOT the security boundary.
//
// Safeguard: a Super Admin cannot delete their own account (prevents locking
// yourself / the org out of user management).

const { requireRole, getUser } = require('./utils/auth');
const { identityRequest } = require('./utils/identity-admin');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'DELETE' && event.httpMethod !== 'POST') {
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

  const { userId } = payload;
  if (!userId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'userId is required.' }) };
  }

  // Prevent self-deletion.
  const caller = getUser(context);
  if (caller && caller.id === userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'You cannot delete your own account.' }),
    };
  }

  try {
    await identityRequest(context, `/users/${userId}`, { method: 'DELETE' });
    return { statusCode: 200, body: JSON.stringify({ success: true, userId }) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
