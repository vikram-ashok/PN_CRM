// netlify/functions/utils/auth.js
//
// Shared authentication/authorization helpers for every Netlify Function.
//
// PRIMARY path: Netlify may hand the decoded Identity JWT to a function on
// `context.clientContext.user` when the caller sends the Identity access
// token as `Authorization: Bearer <token>`. However, on some sites/setups
// that injection does NOT happen (clientContext.user comes back undefined
// even for a perfectly valid token) - which silently 401s every request.
//
// FALLBACK path (robust): when clientContext.user is missing, we verify the
// bearer token OURSELVES by calling Netlify Identity's own `/user` endpoint
// with the token. GoTrue validates the token's signature server-side and, on
// success, returns the user object (including app_metadata.roles). This means
// a forged token cannot pass - the role is only trusted after Identity has
// verified the signature. We NEVER trust a role sent in the body/query.

const VALID_ROLES = ['team', 'admin', 'superadmin'];

// --- token / identity helpers ------------------------------------------------

function getBearerToken(event) {
  const h = (event && event.headers) || {};
  // Netlify lowercases header names, but be defensive about casing.
  const raw = h.authorization || h.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return m ? m[1] : null;
}

function getIdentityUrl(context) {
  // Netlify injects the site's Identity URL here when it can; otherwise fall
  // back to the standard per-site path derived from the deploy URL.
  const fromCtx =
    context && context.clientContext && context.clientContext.identity && context.clientContext.identity.url;
  if (fromCtx) return fromCtx;
  const site = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (site) return `${site.replace(/\/$/, '')}/.netlify/identity`;
  return 'https://pncrm.netlify.app/.netlify/identity';
}

/**
 * Resolves the VERIFIED Identity user for this request, or null.
 * 1) Uses context.clientContext.user if Netlify populated it.
 * 2) Otherwise validates the Authorization bearer token via GoTrue /user.
 * The result is cached on the context so getUser() can read it synchronously
 * after requireRole() has run.
 */
async function resolveUser(event, context) {
  if (context && context._verifiedUser !== undefined) return context._verifiedUser;

  let user = (context && context.clientContext && context.clientContext.user) || null;

  if (!user) {
    const token = getBearerToken(event);
    if (token) {
      try {
        const res = await fetch(`${getIdentityUrl(context)}/user`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          user = await res.json(); // verified user incl. app_metadata.roles
        }
      } catch (_) {
        // network/parse failure -> treat as unauthenticated
        user = null;
      }
    }
  }

  if (context) context._verifiedUser = user;
  return user;
}

// --- role helpers ------------------------------------------------------------

function roleFromUser(user) {
  const roles = (user && user.app_metadata && user.app_metadata.roles) || [];
  if (roles.includes('superadmin')) return 'superadmin';
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('team')) return 'team';
  const match = roles.find((r) => VALID_ROLES.includes(String(r).toLowerCase()));
  return match ? String(match).toLowerCase() : null;
}

/**
 * Async: returns the caller's verified role, or null.
 */
async function getUserRole(event, context) {
  const user = await resolveUser(event, context);
  return roleFromUser(user);
}

/**
 * Returns the (already-resolved) verified user object, or null. Call this only
 * AFTER requireRole() has run in the same handler, so the user is cached.
 * Falls back to clientContext.user if requireRole wasn't used.
 */
function getUser(context) {
  if (context && context._verifiedUser !== undefined) return context._verifiedUser;
  return (context && context.clientContext && context.clientContext.user) || null;
}

/**
 * Enforces that the caller is authenticated AND has one of `allowedRoles`.
 * Returns `null` when the check passes; otherwise returns a ready-to-return
 * Lambda response object. MUST be awaited:
 *
 *   const denied = await requireRole(event, context, ['admin', 'superadmin']);
 *   if (denied) return denied;
 */
async function requireRole(event, context, allowedRoles) {
  const role = await getUserRole(event, context);

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

module.exports = { getUserRole, getUser, requireRole, resolveUser, VALID_ROLES };
