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
  // Call functions at their NATIVE path, not via the /api/* rewrite.
  // Netlify only decodes+verifies the Identity JWT into
  // context.clientContext.user when the function is hit at
  // /.netlify/functions/*; a rewrite forwards the Authorization header but
  // skips that injection, leaving clientContext.user null (=> 401).
  let url = `/.netlify/functions/${path}`;
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

  // Team members (email/name/role) - all roles; for owner pickers & name display
  listMembers: () => request('members-list'),

  // Bulk import leads from parsed CSV rows
  importLeads: (rows) => request('leads-import', { method: 'POST', body: { rows } }),

  // Deals
  listDeals: (leadId) => request('deals-list', { query: { leadId } }),
  createDeal: (payload) => request('deals-create', { method: 'POST', body: payload }),
  updateDeal: (recordId, updates) => request('deals-update', { method: 'PATCH', body: { recordId, ...updates } }),

  // Activities
  listActivities: (leadId) => request('activities-list', { query: { leadId } }),
  createActivity: (payload) => request('activities-create', { method: 'POST', body: payload }),

  // Dashboard
  dashboardSummary: () => request('dashboard-summary'),

  // Performance (per-team-member metrics for a date range)
  performanceSummary: (from, to) => request('performance-summary', { query: { from, to } }),

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

export const ACTIVITY_TYPES = ['Call', 'Email', 'Meeting', 'Note', 'LinkedIn'];

// Call outcomes (only meaningful when Activity Type === 'Call').
export const CALL_OUTCOMES = ['Connected', 'DNP'];

// Email events (only meaningful when Activity Type === 'Email'). Opens and
// replies are logged as separate events (Team users can't edit records).
export const EMAIL_EVENTS = ['Sent', 'Opened', 'Replied'];

// LinkedIn outreach steps (only meaningful when Activity Type === 'LinkedIn').
// Like email, each step is logged as its own entry (create-only model).
export const LINKEDIN_EVENTS = ['Request Sent', 'Accepted', 'Message Sent', 'Read', 'Replied'];

// The 10 tracked performance metrics: key + label + optional target key.
export const PERFORMANCE_METRICS = [
  { key: 'leadsSourced', label: 'Leads sourced', target: 'leadsSourced' },
  { key: 'appointments', label: 'Appointments set', target: 'appointments' },
  { key: 'callsMade', label: 'Calls made', target: 'callsMade' },
  { key: 'callsConnected', label: 'Calls connected' },
  { key: 'dnps', label: 'DNPs' },
  { key: 'followUpCalls', label: 'Follow-up calls' },
  { key: 'emailsSent', label: 'Emails sent', target: 'emailsSent' },
  { key: 'emailsOpened', label: 'Emails opened' },
  { key: 'followUpEmails', label: 'Follow-up emails' },
  { key: 'emailReplies', label: 'Email replies' },
];
