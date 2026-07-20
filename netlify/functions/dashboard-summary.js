// netlify/functions/dashboard-summary.js
//
// GET /api/dashboard-summary
// Any authenticated role may view the dashboard. Returns a count of Leads
// per Funnel Stage for the summary bar chart / pipeline view. Read-only for
// everyone, including Admin/Super Admin - no edit affordances live here.

const { requireRole } = require('./utils/auth');
const { TABLES, listRecords } = require('./utils/airtable');

// Canonical stage order (also used by the frontend Kanban board) - keep this
// list in sync with the "Funnel Stage" single-select options in Airtable.
const STAGE_ORDER = [
  'New Lead',
  'Contacted',
  'Qualified',
  'Demo / Meeting',
  'Proposal',
  'Negotiation',
  'Closed Won',
  'Closed Lost',
  'Nurture',
];

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const denied = requireRole(context, ['team', 'admin', 'superadmin']);
  if (denied) return denied;

  try {
    // Pull all leads (paginating through Airtable's 100-record pages) and
    // tally counts client-side in the function - simplest approach given the
    // Airtable REST API has no native GROUP BY.
    const counts = STAGE_ORDER.reduce((acc, stage) => ({ ...acc, [stage]: 0 }), {});
    let offset;
    let total = 0;

    do {
      const data = await listRecords(TABLES.LEADS, { pageSize: 100, offset });
      (data.records || []).forEach((rec) => {
        const stage = rec.fields && rec.fields['Funnel Stage'];
        if (stage) {
          counts[stage] = (counts[stage] || 0) + 1;
        }
        total += 1;
      });
      offset = data.offset;
    } while (offset);

    return {
      statusCode: 200,
      body: JSON.stringify({ stageOrder: STAGE_ORDER, counts, total }),
    };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
