# ProductNova CRM

A secure, multi-role CRM for ProductNova's sales funnel — from lead sourcing
to conversion. Built as a static React frontend + Netlify Functions backend,
using Airtable as the database and Netlify Identity for authentication.

**Roles:** Team, Admin, Super Admin — see the permission matrix below. The
core rule this app enforces (server-side, not just in the UI): **Team
members can create records but can never edit or delete them once entered.**

## Permission matrix

| Capability | Team | Admin | Super Admin |
|---|---|---|---|
| Log in | Yes | Yes | Yes |
| Create leads/records | Yes | Yes | Yes |
| View records | Yes | Yes | Yes |
| Edit/update existing records | No | Yes | Yes |
| Delete records | No | Yes | Yes |
| Copy/paste/export from app | No | Yes | Yes |
| Assign leads to owners | No | Yes | Yes |
| Move leads between stages | Create-time only | Yes | Yes |
| Manage users / assign roles | No | No | Yes |
| Access Airtable base directly | No | Yes | Yes |

## Architecture

- **Frontend:** Vite + React (functional components, React Router), plain
  CSS with custom properties (no Tailwind/UI kit) — see `src/`.
- **Auth:** `netlify-identity-widget`, wrapped in `src/AuthContext.jsx`.
  Roles live in each Identity user's `app_metadata.roles` array (one of
  `"team"`, `"admin"`, `"superadmin"`).
- **Backend:** Netlify Functions in `netlify/functions/`. Every function
  reads the caller's role from `context.clientContext.user.app_metadata.roles`
  (populated by Netlify from the Identity JWT sent in the `Authorization`
  header) — **never** from anything in the request body. Shared helpers:
  `netlify/functions/utils/auth.js` (role checks) and
  `netlify/functions/utils/airtable.js` (Airtable REST calls).
- **Database:** Airtable base `app4hkkQMCZGBwGGk` (already created — see
  `AIRTABLE_SCHEMA.md` for full field-level docs). The Airtable API token
  lives ONLY in Netlify Functions' environment variables; it is never sent
  to the browser.

## Deployment guide (step by step)

### 1. Push this repo to GitHub

This folder is already a git repo with an initial commit. Create a new
GitHub repository and push it:

```bash
cd productnova-crm
git remote add origin <your-github-repo-url>
git branch -M main
git push -u origin main
```

### 2. Create a Netlify site from the repo

1. In Netlify, click **Add new site → Import an existing project**.
2. Connect your GitHub account and select this repo.
3. Build settings should auto-detect from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
4. Deploy the site.

### 3. Enable Netlify Identity

1. Go to **Site settings → Identity → Enable Identity**.
2. Under **Registration**, set it to **Invite only** (do NOT leave it open —
   this app has no public signup flow, Team/Admin/Super Admin users are all
   invited by a Super Admin).
3. Under **External providers**, leave all OFF (Google/GitHub/etc.) — this
   app uses email + password only.
4. Under **Emails**, you can customize the invite/confirmation/password
   recovery email templates if desired (optional).

### 4. Set environment variables

Go to **Site settings → Environment variables** and add:

| Key | Value |
|---|---|
| `AIRTABLE_TOKEN` | A Personal Access Token from https://airtable.com/create/tokens with `data.records:read` and `data.records:write` scopes on the ProductNova base |
| `AIRTABLE_BASE_ID` | `app4hkkQMCZGBwGGk` |

`IDENTITY_ADMIN_TOKEN` does **not** need to be set in Netlify — Netlify
automatically supplies an Identity admin token to your functions at
`context.clientContext.identity.token` once Identity is enabled on the site.
It's only used as a local-dev fallback (see `.env.example`).

Redeploy the site after adding env vars (Netlify → Deploys → Trigger deploy)
so functions pick them up.

### 5. Invite the first Super Admin

1. Go to **Site settings → Identity → Identity tab → Invite users**.
2. Enter your own email and send the invite. Accept it via the emailed link
   and set a password.
3. Back in the Identity tab, click your user, and edit **Metadata** to add:
   ```json
   { "roles": ["superadmin"] }
   ```
   under `app_metadata` (Netlify's Identity tab lets you edit this directly
   in the UI — look for "App metadata" on the user's detail panel).
4. Log in to the deployed app — you should now see "Manage Users" in the nav.

### 6. Invite Team / Admin users

Two ways to do this, both fine:

- **From the app:** as Super Admin, go to **Manage Users** and use the
  "Invite a New User" form — it calls `users-invite.js`, which uses the
  Identity Admin API to create the user (with the chosen role already set)
  and Netlify sends them an invite email automatically.
- **Manual fallback:** invite via **Site settings → Identity → Identity tab
  → Invite users**, then edit that user's `app_metadata.roles` by hand the
  same way you did for the Super Admin above. Use this fallback any time the
  in-app user management screen isn't available or errors out — it always
  works because it's Netlify's own native UI.

### Local development

```bash
npm install
npm install -g netlify-cli   # if you don't have it already
netlify dev
```

`netlify dev` runs the Vite dev server AND emulates Netlify Functions +
Identity together, so `/api/*` calls and login work locally. Create a local
`.env` (copy `.env.example`) with your own `AIRTABLE_TOKEN` for this to work
against real data — be careful not to point local dev at production data if
you're testing destructive actions (delete, role changes).

## Screens

1. **Login** — Netlify Identity widget modal (login / signup / forgot
   password all built in). Self-registration is disabled by the Identity
   "Invite only" setting from step 3 above.
2. **Dashboard** — read-only count of leads per Funnel Stage. No edit
   controls here for any role — it's a summary view only.
3. **Add Lead** — available to all roles; Team's primary entry point.
4. **Leads list (Kanban by stage)** — Team gets a fully read-only,
   non-copyable view (no edit/delete affordances at all); Admin/Super Admin
   get inline delete controls and a CSV export button.
5. **Lead Detail** — shows the lead plus linked Company, Deals, and
   Activities. Editable only for Admin/Super Admin (edit form, delete,
   reassign owner, change stage). Team sees read-only fields but can still
   log new Activities (a create action, allowed for everyone).
6. **Manage Users** (Super Admin only) — list users, invite new ones with a
   role, change an existing user's role.

## Security Notes

**What is actually enforced (the real security boundary):**
- Every Netlify Function independently verifies the caller's role from the
  Netlify Identity JWT via `context.clientContext.user.app_metadata.roles`
  (see `netlify/functions/utils/auth.js`). It never trusts a role string
  sent in the request body or query string.
- `leads-update.js`, `leads-delete.js`, and `deals-update.js` explicitly
  reject the `"team"` role with HTTP 403 before touching Airtable — this
  holds even if someone crafts a raw HTTP request bypassing the UI entirely.
- `users-list.js`, `users-invite.js`, and `users-update-role.js` similarly
  reject anyone who is not `"superadmin"`.
- The Airtable API token (`AIRTABLE_TOKEN`) is read only inside
  `netlify/functions/` — it is never bundled into the frontend JS and never
  sent to the browser. You can verify this yourself: `grep -r AIRTABLE_TOKEN
  src/` returns nothing.

**What this app explicitly does NOT protect against (by design — this is a
UX deterrent, not DRM):**
- The Team-role "lockdown" (`src/components/TeamLockdown.jsx`) applies
  `user-select: none` and blocks `copy`/`cut`/`contextmenu` browser events.
  This discourages casual copy-paste but is trivially bypassable by anyone
  who opens browser devtools, disables JavaScript, or reads the rendered DOM
  / network responses directly. It is a courtesy speed bump, not a security
  control.
- Screenshotting the screen is entirely out of scope — there is no way for
  a web app to prevent that, and this project does not attempt to.
- If you need genuinely leak-proof data handling, that requires a different
  architecture (e.g. watermarking, DRM viewers, or not showing Team members
  the raw data at all) — well beyond what a CRM web app can enforce.

## Nurture stage behavior

`Nurture` is just one of the Funnel Stage values — setting a lead to Nurture
does not trigger any email from this app. An external automation (outside
this codebase) watches the Airtable base for Nurture-stage leads and handles
drip emails elsewhere. Admin/Super Admin can move a lead back to an active
stage (e.g. Contacted, Qualified) from the Lead Detail edit form at any time.

## Project structure

```
productnova-crm/
├── netlify.toml                  # build config, /api/* redirect, SPA fallback
├── package.json
├── vite.config.js
├── index.html
├── .env.example
├── AIRTABLE_SCHEMA.md
├── README.md
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── AuthContext.jsx           # netlify-identity-widget wrapper + role derivation
│   ├── api.js                    # fetch wrapper for /api/* functions (attaches JWT)
│   ├── theme.css                 # brand palette as CSS custom properties
│   ├── styles.css
│   ├── components/
│   │   ├── Navbar.jsx
│   │   ├── ProtectedRoute.jsx
│   │   ├── RoleGate.jsx
│   │   └── TeamLockdown.jsx      # anti-copy/export enforcement for Team role
│   └── pages/
│       ├── Login.jsx
│       ├── Dashboard.jsx
│       ├── AddLead.jsx
│       ├── LeadsList.jsx
│       ├── LeadDetail.jsx
│       └── UserManagement.jsx
└── netlify/functions/
    ├── utils/
    │   ├── auth.js               # getUserRole / requireRole
    │   ├── airtable.js           # Airtable REST wrapper
    │   └── identity-admin.js     # Identity Admin API wrapper
    ├── leads-create.js
    ├── leads-list.js
    ├── leads-update.js           # 403s "team"
    ├── leads-delete.js           # 403s "team"
    ├── companies-list.js
    ├── deals-list.js
    ├── deals-create.js
    ├── deals-update.js           # 403s "team"
    ├── activities-list.js
    ├── activities-create.js
    ├── dashboard-summary.js
    ├── users-list.js             # superadmin only
    ├── users-invite.js           # superadmin only
    └── users-update-role.js      # superadmin only
```

## Branding

Colors live in `src/theme.css` as CSS custom properties (`--pn-primary`,
`--pn-primary-light`, `--pn-bg`, `--pn-text`, etc.) — swap in ProductNova's
exact brand hex codes there whenever you have them. The header currently
shows a placeholder text logo "ProductNova CRM" (`src/components/Navbar.jsx`)
— there's a comment right above it showing exactly how to swap in an
`<img>` logo later.
