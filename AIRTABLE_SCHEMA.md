# ProductNova CRM — Airtable Schema Reference

This documents the **live** Airtable base already created and used by this
app. Netlify Functions reference the exact table IDs and field names below —
if you ever rename a field in Airtable, update the corresponding function(s)
in `netlify/functions/` to match.

**Base ID:** `app4hkkQMCZGBwGGk`
**Base URL:** `https://airtable.com/app4hkkQMCZGBwGGk`

## Tables

### Companies — `tbl81VfFza4qVL3Ds`
| Field | Type | Notes |
|---|---|---|
| Company Name | Single line text (primary) | |
| Industry | Single line text | |
| Website | URL | |
| Size | Single line text | e.g. "1-10", "50-200" |
| Linked Leads | Link to Leads | auto-populated by Airtable from Leads.Company |
| Linked Deals | Link to Deals | auto-populated by Airtable from Deals.Linked Company |

### Leads — `tbljZ6aZwreXPq755`
| Field | Type | Notes |
|---|---|---|
| Full Name | Single line text (primary) | |
| Email | Email | |
| Phone | Phone number | |
| Company | Link to Companies | single link |
| Lead Source | Single select | LinkedIn, Referral, Webinar, Website Form, Cold Outreach, Event, Other |
| Source / Campaign Detail | Single line text | free text detail |
| Funnel Stage | Single select | New Lead, Contacted, Qualified, Demo / Meeting, Proposal, Negotiation, Closed Won, Closed Lost, Nurture, **Cold**. "Cold" is set automatically when a lead is unreachable after 5 DNPs + a final attempt (see DNP flow below); it registers on first use via `typecast:true` on lead create/update. Excluded from the callback (Today) queue. |
| Owner | Single line text | stores the assigned team member's **email**; reassignable |
| Sourced By | Single line text | email of whoever **sourced** (created/imported) the lead. Stamped server-side on create & import; **does not change** when Owner is reassigned. Admins may set it per-row via the Bulk Import CSV's optional `Sourced By` column (blank => the importer); a Team member's imports are always sourced by themselves. Admin/Super Admin can also correct it from Lead Detail (Team cannot). Credited in the "Leads sourced" performance metric. |
| Import Batch ID | Single line text | set only on leads created via **Bulk Import**; matches a row in the Import Batches table so a whole import can be reviewed/bulk-deleted. Blank for individually-created leads. |
| Notes | Long text | |
| Created Date | Date/time | set by the app on record creation. Bulk Import can back-date this via the CSV's optional `Sourced Date` column (the date the lead was actually sourced), so "Date Added" and the Leads-sourced metric reflect the true date. |
| Last Activity Date | Date/time | the lead's last-contact date. Bumped by `activities-create.js` to each logged activity's date (and by the Import Calls feature). Shown as "Last Contact" on the Leads table + Lead Detail. |
| Lost Reason | Single line text | |
| Next Contact Date | Date (YYYY-MM-DD) | next day the owner should contact this lead (e.g. a requested callback); drives the Today queue. Auto-set to **tomorrow** each time a DNP call is logged (see DNP flow below). Shown as "Next Contact" on the Leads table (Overdue in red if past, highlighted if today). |
| Next Contact Note | Long text | short note on the next contact, e.g. "call back re pricing" |
| LinkedIn URL | URL | the lead's LinkedIn profile, for outreach tracking |
| Deals | Link to Deals | auto-populated from Deals.Linked Lead |
| Activities | Link to Activities | auto-populated from Activities.Linked Lead |

### Deals — `tbleSSVgY3V2dYfVg`
| Field | Type | Notes |
|---|---|---|
| Deal Name | Single line text (primary) | |
| Linked Lead | Link to Leads | |
| Linked Company | Link to Companies | |
| Deal Value | Currency (₹) | |
| Expected Close Date | Date | |
| Probability % | Percent | |
| Stage | Single select | New Lead, Contacted, Qualified, Demo / Meeting, Proposal, Negotiation, Closed Won, Closed Lost |
| Owner | Single line text | assigned team member's email |

### Activities — `tblCLZiLIDst1DGLQ`
| Field | Type | Notes |
|---|---|---|
| Summary | Long text (primary) | |
| Linked Lead | Link to Leads | |
| Activity Type | Single select | Call, Email, Meeting, Note, **LinkedIn**. The "LinkedIn" option is registered on first use via `typecast:true` in `activities-create.js` (the Airtable MCP couldn't edit the existing select's choices). |
| Date | Date/time | |
| Logged By | Single line text | stamped from the caller's Identity email server-side |
| Call Outcome | Single select | Connected, DNP — set only on `Call` activities (drives calls-connected / DNP metrics) |
| DNP Attempt | Number (1–5) | on a `Call` with Outcome = DNP: which unanswered attempt this was. In the manual log form it's auto-suggested (prior DNP calls since last Connected + 1, capped 5). In **Import Calls** it's derived from how many times the number appears in the dialer CSV (2 calls → DNP 2, etc.); a number dialed >5 times without connecting marks the lead **Cold** instead |
| Is Follow-Up | Checkbox | set on `Call` or `Email` activities that are follow-ups (drives follow-up call/email metrics) |
| Email Event | Single select | Sent, Opened, Replied — set on `Email` activities. Opens/replies are logged as **separate** activity records (not edits), since Team users can't edit records |
| LinkedIn Event | Single select | Request Sent, Accepted, Message Sent, Read, Replied — set on `LinkedIn` activities. Each step is its own entry (create-only), same pattern as Email |
| Message Content | Long text | body of the Email/LinkedIn message that was sent, or the reply text on a "Replied" entry |

### Import Batches — `tblwTwWLKG0dx7OsQ`
One record per **Bulk Import** of leads, so an Admin can see the list of
imports and delete a bad batch. Written by `leads-import.js`; read by
`import-batches-list.js`; reconciled (count updated, or record removed when the
batch is emptied) by `leads-bulk-delete.js`.

| Field | Type | Notes |
|---|---|---|
| Batch ID | Single line text (primary) | matches `Import Batch ID` stamped on each imported lead |
| Imported By | Single line text | email of the user who ran the import |
| Imported At | Date/time | when the import ran |
| Lead Count | Number (precision 0) | leads created in this import; decremented as leads are bulk-deleted |
| File Name | Single line text | original CSV filename, for reference |

### Performance metrics (Team Performance page)

The `/performance` page aggregates per team member (by `Owner` on Leads and
`Logged By` on Activities) over a selectable day/week/month window:

1. **Leads sourced** — Leads with `Created Date` in range, counted by **`Sourced By`** (falls back to `Owner` for legacy leads with no Sourced By) · target = 30 × working days (Mon–Fri)
2. **Appointments set** — Activities of type `Meeting` · target = monthly 10 pro-rated by working days (~2–3/week)
3. **Calls made** — Activities of type `Call` · target = 30 × working days (call each sourced lead)
4. **Calls connected** — `Call` + Call Outcome = Connected
5. **DNPs** — `Call` + Call Outcome = DNP
6. **Follow-up calls** — `Call` + Is Follow-Up
7. **Emails sent** — `Email` + Email Event = Sent (blank event treated as Sent) · target = 30 × working days

### Pace-based scoreboard (Team Performance page)

The Performance page shows a per-rep **scoreboard** above the full metric
table. For the four targeted metrics (leads, calls, emails, appointments) each
progress bar's fill = actual ÷ full-range target, and a tick marks
"expected by today" = target × (`elapsedWorkingDays` ÷ `workingDays`). Bar
colour reflects **pace** (actual ÷ expected-to-date): green ≥95%, amber ≥75%,
red below. `performance-summary.js` returns `elapsedWorkingDays` alongside
`workingDays` to drive this. Access is unchanged: admins see every rep, a team
member sees only their own card (server-enforced).

> Not yet tracked as targets: **monthly conversions (2–3)** and **$ ticket /
> pipeline size ($10K min, $30–50K viable)**. These need new lead fields (a
> won/conversion flag + a deal value) before they can join the scoreboard —
> see SESSION_LOG_2026-07-22.md follow-ups.
8. **Emails opened** — `Email` + Email Event = Opened
9. **Follow-up emails** — `Email` (Sent) + Is Follow-Up
10. **Email replies** — `Email` + Email Event = Replied

Access: Admin/Super Admin see all members; a Team member sees only their own row (enforced server-side).

## Funnel Stage order (used across the app)

`New Lead → Contacted → Qualified → Demo / Meeting → Proposal → Negotiation → Closed Won / Closed Lost`, plus the parallel state `Nurture`.

**Nurture** is just a Funnel Stage value — the CRM never sends emails. An
external automation (outside this app) watches Airtable for Nurture-stage
records and runs email drips elsewhere. A lead can be moved back out of
Nurture into an active stage at any time from the Lead Detail edit form —
by Admin/Super Admin on any lead, or by a Team member on a lead they own
(as of 22 Jul 2026 Team may edit Funnel Stage / Notes / Email / Phone on
their own leads; see SESSION_LOG_2026-07-22.md).

## DNP → next-day callback → Cold flow

Driven from the Lead Detail activity form (`src/pages/LeadDetail.jsx`):

- Logging a **Call** with outcome **DNP** auto-sets the lead's `Next Contact
  Date` to **tomorrow** (Asia/Kolkata) and stamps a "retry after DNP n" note.
- This repeats for DNP 1 → 5 (`DNP Attempt` capped at 5).
- The attempt *after* DNP 5 is the **final attempt**: instead of recording a
  DNP 6, the lead's Funnel Stage is set to **Cold** and its Next Contact Date is
  cleared (it drops out of the Today queue). A Connected call at any point
  resets the DNP counter.
- Reviving a Cold lead is just moving it back to an active stage.

## Recreating this schema from scratch (if you ever need a second base)

1. Create a new Airtable base, e.g. "ProductNova CRM".
2. Create table **Companies** with fields: `Company Name` (primary text),
   `Industry` (text), `Website` (URL), `Size` (text). Add `Linked Leads` and
   `Linked Deals` link fields *after* creating Leads/Deals (Airtable will
   offer to auto-create the reverse link).
3. Create table **Leads** with fields: `Full Name` (primary text), `Email`
   (email), `Phone` (phone), `Company` (link → Companies), `Lead Source`
   (single select with the 7 options above), `Source / Campaign Detail`
   (text), `Funnel Stage` (single select with the 9 options above), `Owner`
   (text), `Notes` (long text), `Created Date` (date+time), `Last Activity
   Date` (date+time), `Lost Reason` (text).
4. Create table **Deals** with fields: `Deal Name` (primary text), `Linked
   Lead` (link → Leads), `Linked Company` (link → Companies), `Deal Value`
   (currency, ₹ symbol), `Expected Close Date` (date), `Probability %`
   (percent), `Stage` (single select, 8 options excluding Nurture), `Owner`
   (text).
5. Create table **Activities** with fields: `Summary` (primary, long text),
   `Linked Lead` (link → Leads), `Activity Type` (single select: Call,
   Email, Meeting, Note), `Date` (date+time), `Logged By` (text).
6. Go back to **Companies** and add `Linked Leads` / `Linked Deals` link
   fields if Airtable didn't create them automatically as reverse links.
7. Grab the new base ID from the API docs (Airtable → Help → API
   documentation, or the base URL) and update `AIRTABLE_BASE_ID` in your
   environment variables. Update the table IDs in
   `netlify/functions/utils/airtable.js`'s `TABLES` object to match.
