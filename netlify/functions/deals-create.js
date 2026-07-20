// netlify/functions/deals-create.js
//
// POST /api/deals-create
// Any authenticated role may create a deal (e.g. a Team member logging that
// a deal has been opened for their lead).

const { requireRole, getUser } = require('./utils/auth');
const { TABLES, createRecord } = require('./utils/airtable');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const denied = await requireRole(event, context, ['team', 'admin', 'superadmin']);
  if (denied) return denied;

  const user = getUser(context);

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { dealName, leadId, companyId, dealValue, expectedCloseDate, probability, stage, owner } = payload;

  if (!dealName) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Deal Name is required.' }) };
  }

  const fields = {
    'Deal Name': dealName,
    'Deal Value': dealValue !== undefined ? Number(dealValue) : undefined,
    'Expected Close Date': expectedCloseDate || undefined,
    'Probability %': probability !== undefined ? Number(probability) : undefined,
    'Stage': stage || 'New Lead',
    'Owner': owner || (user && user.email) || undefined,
  };
  if (leadId) fields['Linked Lead'] = [leadId];
  if (companyId) fields['Linked Company'] = [companyId];

  Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);

  try {
    const record = await createRecord(TABLES.DEALS, fields);
    return { statusCode: 201, body: JSON.stringify(record) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
