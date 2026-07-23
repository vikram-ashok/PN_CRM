// netlify/functions/members-list.js
//
// GET /.netlify/functions/members-list
//
// Returns a lightweight roster of Identity users - { email, name, role } -
// for ANY authenticated role. Used by:
//   - the Owner dropdown on Add Lead / Lead reassign
//   - mapping an Owner email to a display name in the Leads table & Performance
//
// This deliberately exposes ONLY email/name/role (colleague identity), never
// tokens or other metadata, so it is safe to expose to Team members. The full
// admin user-management surface (invite / change role) stays Super-Admin-only
// in users-list.js / users-invite.js / users-update-role.js.

const { requireRole } = require('./utils/auth');
const { identityRequest } = require('./utils/identity-admin');

function deriveRole(u) {
  const roles = (u && u.app_metadata && u.app_metadata.roles) || [];
  if (roles.includes('superadmin')) return 'superadmin';
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('team')) return 'team';
  return roles[0] || null;
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const denied = await requireRole(event, context, ['team', 'admin', 'superadmin']);
  if (denied) return denied;

  try {
    const data = await identityRequest(context, '/admin/users');
    const users = (data && data.users) || [];
    const members = users
      .map((u) => ({
        email: u.email,
        name: (u.user_metadata && u.user_metadata.full_name) || u.email,
        role: deriveRole(u),
      }))
      .filter((m) => m.email)
      .sort((a, b) => a.name.localeCompare(b.name));

    return { statusCode: 200, body: JSON.stringify({ members }) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
