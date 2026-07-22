// src/dueLeads.js
//
// Shared helpers for the "who to contact today" queue, used by both the Today
// page and the Dashboard "due" panel. A lead is "due" when its Next Contact
// Date is today or earlier and it isn't already closed. Dates are compared as
// local YYYY-MM-DD strings so the queue matches the user's own calendar day
// (not UTC).

export const CLOSED_STAGES = ['Closed Won', 'Closed Lost'];

// Local calendar date as YYYY-MM-DD (not UTC - avoids the queue flipping over
// at the wrong hour for non-UTC users).
export function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 'overdue' | 'today' | null (null = no date, closed, or a future date).
export function dueStatus(lead, today = localDateStr()) {
  const raw = lead && lead.fields && lead.fields['Next Contact Date'];
  if (!raw) return null;
  if (CLOSED_STAGES.includes(lead.fields['Funnel Stage'])) return null;
  const date = String(raw).slice(0, 10);
  if (date < today) return 'overdue';
  if (date === today) return 'today';
  return null;
}

// Split a list of leads into { overdue, today } arrays, each sorted by date.
export function bucketDueLeads(leads, today = localDateStr()) {
  const overdue = [];
  const dueToday = [];
  (leads || []).forEach((l) => {
    const s = dueStatus(l, today);
    if (s === 'overdue') overdue.push(l);
    else if (s === 'today') dueToday.push(l);
  });
  const byDate = (a, b) =>
    String(a.fields['Next Contact Date']).localeCompare(String(b.fields['Next Contact Date']));
  return { overdue: overdue.sort(byDate), today: dueToday.sort(byDate) };
}
