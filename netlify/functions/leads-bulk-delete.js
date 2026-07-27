// netlify/functions/leads-bulk-delete.js
//
// POST /.netlify/functions/leads-bulk-delete
// Body: { recordIds: [ "rec...", ... ], batchId?: "imp_..." }
//
// Deletes the given lead records in one operation. Built for the Import
// Batches review screen: an Admin ticks the leads from a bad import and
// deletes them together. Admin/Super Admin only (same boundary as the
// single-lead delete), verified server-side against the Identity JWT.
//
// The caller passes the exact record ids to remove (per-lead checkboxes on the
// client), NOT just a batchId - so a batch with a few genuinely-worked leads
// can have those left untouched. `batchId` is optional bookkeeping: when given,
// after the deletes we reconcile the Import Batches metadata record - removing
// it if the batch is now empty, or updating its Lead Count otherwise.

const { requireRole } = require('./utils/auth');
const {
  TABLES, deleteRecords, listAllRecords, listRecords, updateRecord, deleteRecord,
} = require('./utils/airtable');

const MAX_IDS = 1000;

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const denied = await requireRole(event, context, ['admin', 'superadmin']);
  if (denied) return denied;

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const recordIds = Array.isArray(payload.recordIds)
    ? payload.recordIds.filter((id) => typeof id === 'string' && id.startsWith('rec'))
    : null;
  const batchId = payload.batchId ? String(payload.batchId) : null;

  if (!recordIds) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body must include a "recordIds" array.' }) };
  }
  if (recordIds.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No records selected to delete.' }) };
  }
  if (recordIds.length > MAX_IDS) {
    return { statusCode: 400, body: JSON.stringify({ error: `Too many records (max ${MAX_IDS} per bulk delete).` }) };
  }

  try {
    const { deleted, failed } = await deleteRecords(TABLES.LEADS, recordIds);

    // Reconcile the batch metadata record so the Import Batches list stays
    // accurate. Best-effort: never fail the delete over bookkeeping.
    let batchRemaining = null;
    let batchRemoved = false;
    if (batchId) {
      try {
        const safeBatch = batchId.replace(/"/g, '\\"');
        const remaining = await listAllRecords(TABLES.LEADS, {
          filterByFormula: `{Import Batch ID} = "${safeBatch}"`,
        });
        batchRemaining = remaining.length;

        const batchRecs = await listRecords(TABLES.IMPORT_BATCHES, {
          filterByFormula: `{Batch ID} = "${safeBatch}"`,
          maxRecords: 1,
        });
        const batchRec = (batchRecs.records || [])[0];
        if (batchRec) {
          if (batchRemaining === 0) {
            await deleteRecord(TABLES.IMPORT_BATCHES, batchRec.id);
            batchRemoved = true;
          } else {
            await updateRecord(TABLES.IMPORT_BATCHES, batchRec.id, { 'Lead Count': batchRemaining });
          }
        }
      } catch (e) {
        // Leave the metadata as-is; the leads are already gone.
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        deleted: deleted.length,
        failed: failed.length,
        failures: failed.slice(0, 50),
        batchRemaining,
        batchRemoved,
      }),
    };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
