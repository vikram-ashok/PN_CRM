// netlify/functions/utils/auth.js
//
// Shared authentication/authorization helpers for every Netlify Function.
// Netlify Functions receive the caller's decoded Netlify Identity JWT on
// `context.clientContext.user` WHEN the frontend sends the Identity access
// token in the `Authorization: Bearer <token>` header (our src/api.js client
// wrapper does this on every request). We NEVER trust a role sent in the
// request body/query string - only the verified JWT claims are used.

const VALID_ROLES = ['team', 'admin', 'superadmin'];

/**
 * Extracts the caller's role from the Netlify Identity JWT claims embedded
 * in the Lambda "client context" that Netlify injects into every function
 * invocation. Returns null if there is no authenticated user or no
 * recognized role set in app_metadata.roles.
 */
function getUserRole(context) {
  const user = context && context.clientContext && context.clientContext.user;
  if (!user) return null;

  const roles = (user.app_metadata && user.app_metadata.roles) || [];
  // A user should have exactly one of these roles. If multiple are present
  // (shouldn't normally happen), prefer the highest-privilege one so we
  // never accidentally under- or over-grant access.
  if (roles.includes('superadmin')) return 'superadmin';
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('team')) return 'team';

  // Fall back to any recognized role string even if not one of the above
  // exact matches (defensive - keeps working if roles array casing differs).
  const match = roles.find((r) => VALID_ROLES.includes(String(r).toLowerCase()));
  return match ? String(match).toLowerCase() : null;
}

/**
 * Returns the full Identity user object (id, email, app_metadata, etc.) or
 * null if the request is unauthenticated. Useful for stamping "Owner" /
 * "Logged By" fields with the caller's email.
 */
function getUser(context) {
  return (context && context.clientContext && context.clientContext.user) || null;
}

/**
 * Enforces that the caller is authenticated AND has one of `allowedRoles`.
 * Returns `null` when the check passes (caller may proceed). Returns a
 * ready-to-return Lambda response object `{ statusCode, body }` when the
 * check fails - the calling function should `return` that object
 * immediately, e.g.:
 *
 *   const denied = requireRole(context, ['admin', 'superadmin']);
 *   if (denied) return denied;
 */
function requireRole(context, allowedRoles) {
  const role = getUserRole(context);

  if (!role) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized: you must be logged in.' }),
    };
  }

  if (!allowedRoles.includes(role)) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        error: `Forbidden: role "${role}" is not permitted to perform this action.`,
      }),
    };
  }

  return null; // allowed
}

module.exports = { getUserRole, getUser, requireRole, VALID_ROLES };
