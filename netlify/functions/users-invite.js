// netlify/functions/users-invite.js
//
// POST /api/users-invite   body: { email, role }
// Super Admin ONLY - invites a new user via the Identity Admin API and sets
// their initial role in app_metadata.roles. This uses the `/invite` endpoint,
// which creates the user AND sends them an invitation email with a
// set-your-password link. (Do NOT use `/admin/users` here: it creates a user
// record but never sends any email - that was the original bug.)
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

  const denied = await requireRole(event, context, ['superadmin']);
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
    // 1) Send the invitation email + create the user. The invite route is at
    //    the Identity ROOT ("/invite"), NOT under "/admin".
    const user = await identityRequest(context, '/invite', {
      method: 'POST',
      body: { email },
    });

    // 2) The invite endpoint does not persist app_metadata, so set the chosen
    //    role explicitly on the just-created user via the admin users route.
    if (user && user.id) {
      try {
        await identityRequest(context, `/admin/users/${user.id}`, {
          method: 'PUT',
          body: { app_metadata: { roles: [safeRole] } },
        });
        user.app_metadata = { ...(user.app_metadata || {}), roles: [safeRole] };
      } catch (roleErr) {
        // The invite email already went out; if role-setting failed the Super
        // Admin can still fix it with the Change Role dropdown. Don't fail the
        // whole request over it.
      }
    }

    return { statusCode: 201, body: JSON.stringify(user) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
