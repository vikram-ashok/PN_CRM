// netlify/functions/import-batches-list.js
//
// GET /.netlify/functions/import-batches-list
//
// Lists the Bulk-Import batches (one record per import) so an Admin can review
// what's been imported and pick a bad batch to delete. Admin/Super Admin only
// - a Team member has no business seeing or deleting other people's imports,
// and this is enforced server-side (not just hidden in the UI).
//
// Returns { records: [...] } sorted newest-first, matching the shape of the
// other *-list functions so the frontend can read record .id / .fields.

const { requireRole } = require('./utils/auth');
const { TABLES, listAllRecords } = require('./utils/airtable');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const denied = await requireRole(event, context, ['admin', 'superadmin']);
  if (denied) return denied;

  try {
    const records = await listAllRecords(TABLES.IMPORT_BATCHES, {
      'sort[0][field]': 'Imported At',
      'sort[0][direction]': 'desc',
    });
    return { statusCode: 200, body: JSON.stringify({ records }) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
