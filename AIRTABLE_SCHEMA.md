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
| Funnel Stage | Single select | New Lead, Contacted, Qualified, Demo / Meeting, Proposal, Negotiation, Closed Won, Closed Lost, Nurture |
| Owner | Single line text | stores the assigned team member's **email** |
| Notes | Long text | |
| Created Date | Date/time | set by the app (leads-create.js) on record creation |
| Last Activity Date | Date/time | |
| Lost Reason | Single line text | |
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
| Activity Type | Single select | Call, Email, Meeting, Note |
| Date | Date/time | |
| Logged By | Single line text | stamped from the caller's Identity email server-side |
| Call Outcome | Single select | Connected, DNP — set only on `Call` activities (drives calls-connected / DNP metrics) |
| Is Follow-Up | Checkbox | set on `Call` or `Email` activities that are follow-ups (drives follow-up call/email metrics) |
| Email Event | Single select | Sent, Opened, Replied — set on `Email` activities. Opens/replies are logged as **separate** activity records (not edits), since Team users can't edit records |

### Performance metrics (Team Performance page)

The `/performance` page aggregates per team member (by `Owner` on Leads and
`Logged By` on Activities) over a selectable day/week/month window:

1. **Leads sourced** — Leads with `Created Date` in range · target = 30 × working days (Mon–Fri)
2. **Appointments set** — Activities of type `Meeting` · target = monthly 10 pro-rated by working days (~2–3/week)
3. **Calls made** — Activities of type `Call`
4. **Calls connected** — `Call` + Call Outcome = Connected
5. **DNPs** — `Call` + Call Outcome = DNP
6. **Follow-up calls** — `Call` + Is Follow-Up
7. **Emails sent** — `Email` + Email Event = Sent (blank event treated as Sent)
8. **Emails opened** — `Email` + Email Event = Opened
9. **Follow-up emails** — `Email` (Sent) + Is Follow-Up
10. **Email replies** — `Email` + Email Event = Replied

Access: Admin/Super Admin see all members; a Team member sees only their own row (enforced server-side).

## Funnel Stage order (used across the app)

`New Lead → Contacted → Qualified → Demo / Meeting → Proposal → Negotiation → Closed Won / Closed Lost`, plus the parallel state `Nurture`.

**Nurture** is just a Funnel Stage value — the CRM never sends emails. An
external automation (outside this app) watches Airtable for Nurture-stage
records and runs email drips elsewhere. Admin/Super Admin can move a lead
back out of Nurture into an active stage at any time from the Lead Detail
edit form.

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
