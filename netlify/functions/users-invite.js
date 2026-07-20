// netlify/functions/users-invite.js
//
// POST /api/users-invite   body: { email, role }
// Super Admin ONLY - invites a new user via the Identity Admin API and sets
// their initial role in app_metadata.roles. Netlify sends the actual invite
// email itself once the user is created via the admin API with
// `confirm: false` behaviour (an invite/confirmation email goes out).
//
// FALLBACK: Vikram can also invite users manually from Site settings >
// Identity > "Invite users", then edit their app_metadata roles field by
// hand in that same screen - see README.md "Manual user management".

const { requireRole } = require('./utils/auth');
const { identityRequest } = require('./utils/identity-admin');
const { VALID_ROLES } = require('./utils/auth');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const denied = requireRole(context, ['superadmin']);
  if (denied) return denied;

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { email, role } = payload;
  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'email is required.' }) };
  }
  const safeRole = VALID_ROLES.includes(role) ? role : 'team';

  try {
    const user = await identityRequest(context, '/users', {
      method: 'POST',
      body: {
        email,
        app_metadata: { roles: [safeRole] },
      },
    });
    return { statusCode: 201, body: JSON.stringify(user) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
