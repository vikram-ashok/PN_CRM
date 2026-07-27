// netlify/functions/leads-import.js
//
// POST /.netlify/functions/leads-import
// Body: { rows: [ { fullName, email, phone, companyName, leadSource,
//                    sourceCampaignDetail, funnelStage, owner, notes }, ... ],
//         fileName?: string }
//
// Bulk-creates leads from a parsed CSV. Available to ALL authenticated roles
// (Team included). Owner rules mirror leads-create.js: a Team member always
// owns every row they import; Admin/Super Admin may set an owner per row
// (falling back to themselves). Companies are found-or-created with a single
// shared cache so a big import doesn't re-scan Companies for every row.
//
// BATCH TRACKING: every import gets a generated Import Batch ID which is
// stamped on every lead it creates. After the rows are created, one record is
// written to the Import Batches table (who imported, when, how many, filename)
// so an Admin can later review the list of imports and bulk-delete a bad one
// (see import-batches-list.js / leads-bulk-delete.js). Each imported lead is
// also stamped with "Sourced By" = the importer's email.

const { requireRole, getUser, getUserRole } = require('./utils/auth');
const { TABLES, createRecord, loadCompanyMap, findOrCreateCompany } = require('./utils/airtable');

const MAX_ROWS = 1000;
const VALID_STAGES = [
  'New Lead', 'Contacted', 'Qualified', 'Demo / Meeting', 'Proposal',
  'Negotiation', 'Closed Won', 'Closed Lost', 'Nurture',
];

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const denied = await requireRole(event, context, ['team', 'admin', 'superadmin']);
  if (denied) return denied;

  const user = getUser(context);
  const role = await getUserRole(event, context);
  const callerEmail = (user && user.email) || undefined;

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const fileName = (payload.fileName || '').toString().trim().slice(0, 255) || undefined;
  const rows = Array.isArray(payload.rows) ? payload.rows : null;
  if (!rows) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body must include a "rows" array.' }) };
  }
  if (rows.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No rows to import.' }) };
  }
  if (rows.length > MAX_ROWS) {
    return { statusCode: 400, body: JSON.stringify({ error: `Too many rows (max ${MAX_ROWS} per import).` }) };
  }

  let companyCache;
  try {
    companyCache = await loadCompanyMap();
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: `Could not load companies: ${err.message}` }) };
  }

  // One id for this whole import; stamped on every lead created below so the
  // batch can be reviewed / bulk-deleted later. Compact, sortable, unique.
  const batchId = `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  let created = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i] || {};
    const rowNum = i + 1; // 1-based for user-facing messages
    const fullName = (r.fullName || '').trim();

    if (!fullName) {
      errors.push({ row: rowNum, error: 'Missing Full Name' });
      continue;
    }

    try {
      let linkedCompanyId = null;
      if (r.companyName) {
        linkedCompanyId = await findOrCreateCompany(r.companyName, companyCache);
      }

      const stage = VALID_STAGES.includes(r.funnelStage) ? r.funnelStage : 'New Lead';
      const ownerEmail = role === 'team' ? callerEmail : ((r.owner || '').trim() || callerEmail);

      const fields = {
        'Full Name': fullName,
        'Email': (r.email || '').trim() || undefined,
        'Phone': (r.phone || '').trim() || undefined,
        'Lead Source': (r.leadSource || '').trim() || undefined,
        'Source / Campaign Detail': (r.sourceCampaignDetail || '').trim() || undefined,
        'Funnel Stage': stage,
        'Owner': ownerEmail,
        'Sourced By': callerEmail,
        'Import Batch ID': batchId,
        'Notes': (r.notes || '').trim() || undefined,
        'Created Date': new Date().toISOString(),
      };
      if (linkedCompanyId) fields['Company'] = [linkedCompanyId];
      Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);

      await createRecord(TABLES.LEADS, fields);
      created += 1;
    } catch (err) {
      errors.push({ row: rowNum, error: err.message });
    }
  }

  // Record the batch itself so it shows up in the admin's list of imports.
  // Only bother if at least one lead was created (an all-failed import leaves
  // no leads to group, so there's nothing to review/delete). A failure to
  // write this metadata must not fail the import - the leads are already in.
  let batchRecorded = false;
  if (created > 0) {
    try {
      await createRecord(TABLES.IMPORT_BATCHES, {
        'Batch ID': batchId,
        'Imported By': callerEmail,
        'Imported At': new Date().toISOString(),
        'Lead Count': created,
        'File Name': fileName,
      });
      batchRecorded = true;
    } catch (err) {
      errors.push({ row: 0, error: `Leads imported, but the batch record could not be saved: ${err.message}` });
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      created,
      failed: errors.length,
      total: rows.length,
      batchId: created > 0 ? batchId : null,
      batchRecorded,
      errors: errors.slice(0, 50),
    }),
  };
};
