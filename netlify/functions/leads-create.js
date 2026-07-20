// netlify/functions/leads-create.js
//
// POST /api/leads-create
// Any authenticated role (team, admin, superadmin) may create a lead - this
// is the Team member's primary entry point into the CRM. The server sets
// "Created Date" itself (never trusts a client-supplied timestamp).

const { requireRole, getUser, getUserRole } = require('./utils/auth');
const { TABLES, createRecord, findOrCreateCompany } = require('./utils/airtable');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Any of the three roles may create a lead - reject only unauthenticated.
  const denied = await requireRole(event, context, ['team', 'admin', 'superadmin']);
  if (denied) return denied;

  const user = getUser(context);
  const role = await getUserRole(event, context);

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const {
    fullName,
    email,
    phone,
    companyId, // Airtable record id of a linked Company, optional (legacy)
    companyName, // free-typed company name, optional (find-or-create)
    leadSource,
    sourceCampaignDetail,
    funnelStage,
    owner,
    notes,
  } = payload;

  if (!fullName) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Full Name is required.' }) };
  }

  // Prefer an explicit companyId; otherwise resolve/ create from a typed name.
  let linkedCompanyId = companyId || null;
  try {
    if (!linkedCompanyId && companyName) {
      linkedCompanyId = await findOrCreateCompany(companyName);
    }
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: `Company lookup failed: ${err.message}` }) };
  }

  // Owner rules: a Team member always owns the leads they create (they can
  // only ever see their own). Admin/Super Admin may assign any owner.
  const callerEmail = (user && user.email) || undefined;
  const ownerEmail = role === 'team' ? callerEmail : (owner || callerEmail);

  // Field names below MUST exactly match the live Airtable schema.
  const fields = {
    'Full Name': fullName,
    'Email': email || undefined,
    'Phone': phone || undefined,
    'Lead Source': leadSource || undefined,
    'Source / Campaign Detail': sourceCampaignDetail || undefined,
    // Team members can set the initial stage at creation time only; once
    // created, changing the stage requires an Admin/Super Admin (enforced
    // in leads-update.js).
    'Funnel Stage': funnelStage || 'New Lead',
    'Owner': ownerEmail,
    'Notes': notes || undefined,
    'Created Date': new Date().toISOString(),
  };

  if (linkedCompanyId) {
    fields['Company'] = [linkedCompanyId];
  }

  // Strip undefined keys so we don't send blank overwrites to Airtable.
  Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);

  try {
    const record = await createRecord(TABLES.LEADS, fields);
    return { statusCode: 201, body: JSON.stringify(record) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
