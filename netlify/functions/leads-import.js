// netlify/functions/leads-import.js
//
// POST /.netlify/functions/leads-import
// Body: { rows: [ { fullName, email, phone, companyName, leadSource,
//                    sourceCampaignDetail, funnelStage, owner, sourcedBy,
//                    sourcedDate, notes }, ... ],
//         fileName?: string }
//
// `sourcedDate` (optional) is the date the lead was actually sourced; it is
// used as the lead's Created Date (blank/unparseable => the import time).
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
const {
  TABLES, createRecord, updateRecord, listRecords, loadCompanyMap, findOrCreateCompany,
} = require('./utils/airtable');

const MAX_ROWS = 1000;

// Parse an optional per-row "sourced date" into an ISO timestamp for the lead's
// Created Date. Accepts YYYY-MM-DD (preferred) or anything Date can parse
// (e.g. DD/MM/YYYY, M/D/YYYY). A date-only value is anchored at 12:00 UTC so it
// can't slip to the previous/next calendar day when displayed in IST. Returns
// undefined for blank/garbage, so the caller falls back to "now".
function parseSourcedDate(v) {
  const s = (v || '').toString().trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T12:00:00.000Z`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${d.toISOString().slice(0, 10)}T12:00:00.000Z`;
}
const VALID_STAGES = [
  'New Lead', 'Contacted', 'Qualified', 'Demo / Meeting', 'Proposal',
  'Negotiation', 'Closed Won', 'Closed Lost', 'Nurture', 'Cold',
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
  // batch can be reviewed / bulk-deleted later. The client sends a shared
  // batchId across all chunks of a large import so they roll up into ONE
  // Import Batches record; if absent (single-shot import) we generate one.
  const batchId = (payload.batchId && String(payload.batchId).trim())
    || `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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
      // Sourced By follows the same rule as Owner: an Admin/Super Admin may
      // credit any sourcer per row via the CSV (blank => the importer); a Team
      // member's imports are always sourced by themselves.
      const sourcedByEmail = role === 'team' ? callerEmail : ((r.sourcedBy || '').trim() || callerEmail);

      const fields = {
        'Full Name': fullName,
        'Email': (r.email || '').trim() || undefined,
        'Phone': (r.phone || '').trim() || undefined,
        'Lead Source': (r.leadSource || '').trim() || undefined,
        'Source / Campaign Detail': (r.sourceCampaignDetail || '').trim() || undefined,
        'Funnel Stage': stage,
        'Owner': ownerEmail,
        'Sourced By': sourcedByEmail,
        'Import Batch ID': batchId,
        'Designation': (r.designation || '').trim() || undefined,
        'Website': (r.website || '').trim() || undefined,
        'Location': (r.location || '').trim() || undefined,
        'Revenue': (r.revenue || '').trim() || undefined,
        'Team Size': (r.teamSize || '').trim() || undefined,
        'Tier': (r.tier || '').trim() || undefined,
        'LinkedIn URL': (r.linkedinUrl || '').trim() || undefined,
        'Notes': (r.notes || '').trim() || undefined,
        // The CSV can carry the date the lead was actually sourced; that
        // becomes its Created Date (so "Date Added" and the Leads-sourced
        // metric reflect the true date). Blank/unparseable => import time.
        'Created Date': parseSourcedDate(r.sourcedDate) || new Date().toISOString(),
      };
      if (linkedCompanyId) fields['Company'] = [linkedCompanyId];
      Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);

      await createRecord(TABLES.LEADS, fields, { typecast: true });
      created += 1;
    } catch (err) {
      errors.push({ row: rowNum, error: err.message });
    }
  }

  // Record the batch itself so it shows up in the admin's list of imports.
  // Only bother if at least one lead was created (an all-failed import leaves
  // no leads to group, so there's nothing to review/delete). A failure to
  // write this metadata must not fail the import - the leads are already in.
  // Upsert the batch metadata: one Import Batches record per batchId. On the
  // first chunk it's created; later chunks increment its Lead Count. Best-
  // effort — the leads are already saved, so this never fails the request.
  let batchRecorded = false;
  if (created > 0) {
    try {
      const safe = batchId.replace(/"/g, '\\"');
      const existing = await listRecords(TABLES.IMPORT_BATCHES, {
        filterByFormula: `{Batch ID} = "${safe}"`,
        maxRecords: 1,
      });
      const rec = (existing.records || [])[0];
      if (rec) {
        const prev = Number((rec.fields && rec.fields['Lead Count']) || 0);
        await updateRecord(TABLES.IMPORT_BATCHES, rec.id, { 'Lead Count': prev + created });
      } else {
        await createRecord(TABLES.IMPORT_BATCHES, {
          'Batch ID': batchId,
          'Imported By': callerEmail,
          'Imported At': new Date().toISOString(),
          'Lead Count': created,
          'File Name': fileName,
        });
      }
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
