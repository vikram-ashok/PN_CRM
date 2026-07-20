# ProductNova CRM — Build Log / Conversation Summary

## What was requested
Build a secure, multi-user CRM for ProductNova tracking the sales funnel from lead sourcing to conversion, per the uploaded build prompt (`1784354878845_CRM_Build_Prompt.md`). Core requirement: **data control** — Team members can create records but never edit/delete them, and cannot copy/export data from the app. All permission checks must be enforced server-side (Netlify Functions), never just hidden in the UI.

Stack: React SPA + Netlify Functions (serverless backend) + Netlify Identity (auth) + Airtable (database). Hosted on Netlify.

## Decisions made
- **Airtable**: created a brand-new base directly via the connected Airtable MCP (rather than Vikram creating it manually).
- **Branding**: ProductNova uses blue + white (site: productnova.in — exact hex codes weren't extractable since the site is client-rendered, so a professional placeholder blue/white palette was used, implemented as CSS variables in `src/theme.css` for easy swapping later).
- **Deployment**: Vikram will push the repo to GitHub himself and connect it to Netlify; Claude cannot push to GitHub directly (no credentials) but prepared a fully committed local git repo.

## Airtable base created
- Base name: **ProductNova CRM**, Base ID: `app4hkkQMCZGBwGGk`
- Tables:
  - **Companies** (`tbl81VfFza4qVL3Ds`) — Company Name, Industry, Website, Size, Linked Leads, Linked Deals
  - **Leads** (`tbljZ6aZwreXPq755`) — Full Name, Email, Phone, Company (link), Lead Source (select), Source/Campaign Detail, Funnel Stage (select: New Lead → Contacted → Qualified → Demo/Meeting → Proposal → Negotiation → Closed Won/Closed Lost, plus parallel **Nurture** stage), Owner, Notes, Created Date, Last Activity Date, Lost Reason, Deals (link), Activities (link)
  - **Deals** (`tbleSSVgY3V2dYfVg`) — Deal Name, Linked Lead, Linked Company, Deal Value (₹), Expected Close Date, Probability %, Stage, Owner
  - **Activities** (`tblCLZiLIDst1DGLQ`) — Summary, Linked Lead, Activity Type (Call/Email/Meeting/Note), Date, Logged By
- Full field-level reference lives in `AIRTABLE_SCHEMA.md` in the repo.

## Repo built
Location: `C:\Users\Vikram\Documents\PN CRM\productnova-crm` (committed git repo, not yet pushed to GitHub).

Contents:
- React (Vite) frontend: Login, Dashboard, Add Lead, Leads List/Board, Lead Detail, User Management (Super Admin only) pages; `AuthContext.jsx` wrapping Netlify Identity; `ProtectedRoute`, `RoleGate`, `TeamLockdown` components; `theme.css`/`styles.css` for blue/white branding.
- Netlify Functions (`netlify/functions/`): create/list/update/delete for Leads, Deals, Activities, Companies-list, Dashboard summary, and Super-Admin-only user management (list/invite/update-role) — every mutating/admin function verifies the caller's Netlify Identity JWT role server-side via a shared `utils/auth.js` helper, rejecting the "team" role on update/delete. Airtable calls are isolated in `utils/airtable.js`; the Airtable token never reaches the frontend.
- `netlify.toml` (build/publish/functions config + `/api/*` redirect + SPA fallback), `.env.example`, `README.md` (full deployment walkthrough + Security Notes section), `AIRTABLE_SCHEMA.md`.

Verification performed before handoff: `npm run build` succeeded, no Airtable secrets found under `src/`, every mutating function confirmed to contain a role check, copy/cut/contextmenu blocking confirmed gated to the "team" role only.

## Deployment progress (as of this conversation)
Vikram deployed to **https://pncrm.netlify.app/** and got through: creating the Netlify site, enabling Identity, setting env vars, and connecting the Airtable base. Stuck at the last step — assigning the first Super Admin's role via `app_metadata.roles` in Netlify Identity.

## Bug found and fixed: infinite "Loading ProductNova CRM..." screen
- Symptom: page loads, shows the loading text, never proceeds — no console errors, no pending/stuck network requests (confirmed via a live Network tab screenshot: all 5 requests completed in ~383ms, no request to `/.netlify/identity/settings` at all).
- Root cause: in `src/AuthContext.jsx`, `netlifyIdentity.init()` was called **before** `netlifyIdentity.on('init', ...)` was registered. `init()` fires its `'init'` event synchronously (it just reads the session from localStorage — no network call needed), so the event fired and was missed entirely before our listener existed, leaving `initializing` stuck at `true` forever with no error.
- Fix: reordered the code so all `.on(...)` listeners are registered **before** `.init()` is called, with a code comment explaining why. Committed as `b55be31 — "Fix Identity init hang: register event listeners before calling init()"`.
- Full `npm install`/`npm run build` couldn't be re-run in the sandbox here (network/proxy timeouts on a fresh install), but the change was verified structurally (correct listener-then-init order, no syntax changes beyond reordering) and committed to git.

## Next steps for Vikram
1. Push the repo (`C:\Users\Vikram\Documents\PN CRM\productnova-crm`) to GitHub and redeploy on Netlify (or trigger a redeploy if already connected) to pick up the fix.
2. Confirm the login screen now appears instead of the infinite loader.
3. Assign the first Super Admin: in Netlify → Identity → the invited user → edit `app_metadata` to `{ "roles": ["superadmin"] }`.
4. Invite Team/Admin users the same way, setting `roles` to `["team"]` or `["admin"]`.
5. Swap the placeholder blue/white theme in `src/theme.css` for ProductNova's exact brand hex codes/logo whenever convenient.
