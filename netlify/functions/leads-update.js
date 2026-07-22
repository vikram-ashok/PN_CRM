// netlify/functions/leads-update.js
//
// PATCH /api/leads-update
//
// PERMISSION MODEL (updated 22 Jul 2026):
//   - Admin / Super Admin: may edit ANY field on ANY lead.
//   - Team: may edit a LIMITED set of fields (Funnel Stage, Notes, Email,
//     Phone) but ONLY on leads they OWN. This lets a rep move their own
//     lead through the funnel and keep contact details / notes current,
//     without being able to rename a lead, reassign its owner, change its
//     source, or touch anyone else's records.
//
// Enforcement is server-side against the verified Identity JWT role claim and
// the record's real Owner in Airtable - it never trusts a role, owner, or
// field list supplied in the request body.

const { requireRole, getUserRole, getUser } = require('./utils/auth');
const { TABLES, getRecord, updateRecord } = require('./utils/airtable');

// Fields a Team member is allowed to change on a lead they own. Includes the
// next-contact date/note so a rep can schedule their own callbacks.
const TEAM_EDITABLE_KEYS = ['funnelStage', 'notes', 'email', 'phone', 'nextContactDate', 'nextContactNote', 'linkedinUrl'];

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'PATCH' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Authenticated callers of any role may reach this point; per-role limits
  // (which fields, which records) are applied below.
  const denied = await requireRole(event, context, ['team', 'admin', 'superadmin']);
  if (denied) return denied;

  const role = await getUserRole(event, context);
  const user = getUser(context);
  const callerEmail = (user && user.email) || '';

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { recordId, ...updates } = payload;
  if (!recordId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'recordId is required.' }) };
  }

  // ---- Team-specific guards: ownership + field whitelist -------------------
  if (role === 'team') {
    // 1) The lead must exist and be owned by the caller.
    let existing;
    try {
      existing = await getRecord(TABLES.LEADS, recordId);
    } catch (err) {
      if (err.statusCode === 404) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Lead not found.' }) };
      }
      return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
    }
    const ownerEmail = (existing.fields && existing.fields['Owner']) || '';
    if (ownerEmail.toLowerCase() !== callerEmail.toLowerCase()) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Forbidden: you can only edit leads you own.' }),
      };
    }

    // 2) Reject any field a Team member is not allowed to change - fail loudly
    //    rather than silently dropping it, so the client isn't misled.
    const disallowed = Object.keys(updates).filter((k) => !TEAM_EDITABLE_KEYS.includes(k));
    if (disallowed.length > 0) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: `Forbidden: your role may only change ${TEAM_EDITABLE_KEYS.join(', ')}. Blocked: ${disallowed.join(', ')}.`,
        }),
      };
    }
  }

  // Map friendly payload keys to exact Airtable field names.
  const fieldMap = {
    fullName: 'Full Name',
    email: 'Email',
    phone: 'Phone',
    leadSource: 'Lead Source',
    sourceCampaignDetail: 'Source / Campaign Detail',
    funnelStage: 'Funnel Stage',
    owner: 'Owner',
    notes: 'Notes',
    lastActivityDate: 'Last Activity Date',
    lostReason: 'Lost Reason',
    nextContactDate: 'Next Contact Date',
    nextContactNote: 'Next Contact Note',
    linkedinUrl: 'LinkedIn URL',
    companyId: 'Company',
  };

  const fields = {};
  Object.entries(updates).forEach(([key, value]) => {
    const airtableField = fieldMap[key];
    if (!airtableField) return; // ignore unknown keys
    if (airtableField === 'Company') {
      fields[airtableField] = value ? [value] : [];
    } else {
      fields[airtableField] = value;
    }
  });

  if (Object.keys(fields).length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No valid fields to update.' }) };
  }

  try {
    const record = await updateRecord(TABLES.LEADS, recordId, fields);
    return { statusCode: 200, body: JSON.stringify(record) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
