// netlify/functions/utils/identity-admin.js
//
// Shared helper for calling the Netlify Identity Admin API from a function.
// Docs: https://docs.netlify.com/visitor-access/identity/identity-api/
//
// The Identity service lives at {SITE_URL}/.netlify/identity and requires an
// admin-scoped bearer token. Note that NOT every admin-authenticated route is
// under /admin: user CRUD is at /admin/users[/id], but the invite route is at
// the identity root (/invite), NOT /admin/invite. For that reason this helper
// returns the Identity ROOT url and each caller passes the full path it needs
// (e.g. "/admin/users", "/admin/users/{id}", "/invite").
//
// IMPORTANT (read the README's "User Management" section too): Netlify runs
// the Identity service per-site, and the cleanest way to authenticate
// server-to-server calls to it is with the site's Identity "admin" JWT,
// which Netlify automatically makes available to functions as
// `context.clientContext.identity.token` when Identity is enabled on the
// site (this is a Netlify-generated token scoped to your site's Identity
// instance - NOT the calling user's personal access token). We use that by
// default, with an optional IDENTITY_ADMIN_TOKEN env var override for local
// dev / edge cases where clientContext.identity isn't populated (e.g. some
// local emulation scenarios).

function getIdentityBaseAndToken(context) {
  const identity = context && context.clientContext && context.clientContext.identity;

  // identity.url is already the Identity root (".../.netlify/identity").
  // The env fallback is the bare site URL, so append the identity path there.
  let baseUrl = identity && identity.url;
  if (!baseUrl && process.env.URL) {
    baseUrl = `${process.env.URL.replace(/\/$/, '')}/.netlify/identity`;
  }
  const token = (identity && identity.token) || process.env.IDENTITY_ADMIN_TOKEN;

  if (!baseUrl) {
    throw new Error(
      'Could not determine Identity site URL. Make sure Netlify Identity is enabled for this site.'
    );
  }
  if (!token) {
    throw new Error(
      'No Identity admin token available. Netlify should supply context.clientContext.identity.token automatically; ' +
        'if running locally without it, set IDENTITY_ADMIN_TOKEN in your env as a fallback.'
    );
  }

  return { baseUrl, token };
}

async function identityRequest(context, path, { method = 'GET', body } = {}) {
  const { baseUrl, token } = getIdentityBaseAndToken(context);
  const url = `${baseUrl}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    data = { raw: text };
  }

  if (!res.ok) {
    const message = (data && data.msg) || res.statusText;
    const err = new Error(`Identity Admin API error (${res.status}): ${message}`);
    err.statusCode = res.status;
    throw err;
  }

  return data;
}

module.exports = { identityRequest };
