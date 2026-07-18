// netlify/functions/utils/airtable.js
//
// Thin wrapper around the Airtable REST API. This file is the ONLY place
// that should ever read process.env.AIRTABLE_TOKEN - it is a server-side
// secret and must never be sent to, or read by, the browser bundle (src/).

const BASE_URL = 'https://api.airtable.com/v0';

// Table IDs from the live ProductNova Airtable base (see AIRTABLE_SCHEMA.md
// for the full field-level documentation). Using table IDs instead of table
// names is more robust - it keeps working even if someone renames a table
// in the Airtable UI later.
const TABLES = {
  COMPANIES: 'tbl81VfFza4qVL3Ds',
  LEADS: 'tbljZ6aZwreXPq755',
  DEALS: 'tbleSSVgY3V2dYfVg',
  ACTIVITIES: 'tblCLZiLIDst1DGLQ',
};

function getBaseId() {
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!baseId) throw new Error('AIRTABLE_BASE_ID environment variable is not set.');
  return baseId;
}

function getToken() {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error('AIRTABLE_TOKEN environment variable is not set.');
  return token;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Generic Airtable REST call. `path` is appended after the base URL
 * (e.g. `/{tableId}` or `/{tableId}/{recordId}`). `query` is an object of
 * query-string params (e.g. { filterByFormula, maxRecords }).
 */
async function airtableRequest(tableId, { method = 'GET', path = '', body, query } = {}) {
  const baseId = getBaseId();
  let url = `${BASE_URL}/${baseId}/${tableId}${path}`;

  if (query && Object.keys(query).length > 0) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value);
      }
    });
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    method,
    headers: authHeaders(),
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
    const message = (data && data.error && (data.error.message || data.error.type)) || res.statusText;
    const err = new Error(`Airtable API error (${res.status}): ${message}`);
    err.statusCode = res.status;
    err.details = data;
    throw err;
  }

  return data;
}

async function listRecords(tableId, query) {
  return airtableRequest(tableId, { method: 'GET', query });
}

async function getRecord(tableId, recordId) {
  return airtableRequest(tableId, { method: 'GET', path: `/${recordId}` });
}

async function createRecord(tableId, fields) {
  return airtableRequest(tableId, { method: 'POST', body: { fields } });
}

async function updateRecord(tableId, recordId, fields) {
  // PATCH only touches the fields provided - it does not clear other fields.
  return airtableRequest(tableId, {
    method: 'PATCH',
    path: `/${recordId}`,
    body: { fields },
  });
}

async function deleteRecord(tableId, recordId) {
  return airtableRequest(tableId, { method: 'DELETE', path: `/${recordId}` });
}

module.exports = {
  TABLES,
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
};
