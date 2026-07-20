// src/api.js
//
// Thin client wrapper around our Netlify Functions (aliased under /api/*
// by netlify.toml). Every call attaches the current Netlify Identity user's
// access token as a Bearer token so the function can verify the caller's
// role server-side via context.clientContext.user. This file NEVER holds
// the Airtable token - that lives only in netlify/functions (server-side).

import netlifyIdentity from 'netlify-identity-widget';

async function authHeader() {
  const user = netlifyIdentity.currentUser();
  if (!user) return {};
  // jwt() refreshes the token if it's close to expiring.
  const token = await user.jwt();
  return { Authorization: `Bearer ${token}` };
}

async function request(path, { method = 'GET', body, query } = {}) {
  let url = `/api/${path}`;
  if (query) {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };

  const res = await fetch(url, {
    method,
    headers,
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
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  // Leads
  listLeads: (stage) => request('leads-list', { query: { stage } }),
  createLead: (payload) => request('leads-create', { method: 'POST', body: payload }),
  updateLead: (recordId, updates) => request('leads-update', { method: 'PATCH', body: { recordId, ...updates } }),
  deleteLead: (recordId) => request('leads-delete', { method: 'DELETE', body: { recordId } }),

  // Companies
  listCompanies: () => request('companies-list'),

  // Deals
  listDeals: (leadId) => request('deals-list', { query: { leadId } }),
  createDeal: (payload) => request('deals-create', { method: 'POST', body: payload }),
  updateDeal: (recordId, updates) => request('deals-update', { method: 'PATCH', body: { recordId, ...updates } }),

  // Activities
  listActivities: (leadId) => request('activities-list', { query: { leadId } }),
  createActivity: (payload) => request('activities-create', { method: 'POST', body: payload }),

  // Dashboard
  dashboardSummary: () => request('dashboard-summary'),

  // Users (Super Admin only)
  listUsers: () => request('users-list'),
  inviteUser: (email, role) => request('users-invite', { method: 'POST', body: { email, role } }),
  updateUserRole: (userId, role) => request('users-update-role', { method: 'PATCH', body: { userId, role } }),
};

// Funnel stage order shared across Dashboard / Kanban / forms - keep in
// sync with the "Funnel Stage" single-select options in Airtable and with
// netlify/functions/dashboard-summary.js's STAGE_ORDER.
export const FUNNEL_STAGES = [
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

export const LEAD_SOURCES = [
  'LinkedIn',
  'Referral',
  'Webinar',
  'Website Form',
  'Cold Outreach',
  'Event',
  'Other',
];

export const ACTIVITY_TYPES = ['Call', 'Email', 'Meeting', 'Note'];
