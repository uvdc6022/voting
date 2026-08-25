# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A student council voting portal for the University of the Visayas — Dalaguete Campus. Plain static HTML/CSS/JS (no framework, no bundler, no `package.json`) backed directly by a Firebase Realtime Database.

## Running it

There is no build step. Open `index.html` directly, or serve the folder with any static file server (e.g. `npx serve` or the VS Code Live Server extension) since every page's JS is loaded as an ES module (`type="module"`), which some browsers block under `file://`. There are no tests and no lint config. Pushes to `main` auto-deploy to GitHub Pages via `.github/workflows/` (uploads the whole repo as-is — no build step there either).

## Architecture

**Seven pages, one shared shell.** `index.html` is the login page (loads `js/auth.js`). Every other page — `dashboard.html`, `cast-vote.html`, `users.html`, `voter-records.html`, `admins.html`, `final-results.html` — shares the same layout (`<aside id="sidebar-root">` + `<main>` content root) and each loads its own same-named module (`js/dashboard.js`, `js/cast-vote.js`, etc.) as the sole page-specific script.

**Role model.** `users/{idNumber}.role` is `1` (voter), `2` (admin), or `3` (super admin). Role gating happens in two places that must stay in sync:
- `session.js`'s `landingPageFor(user)` — where a user lands right after login (role 1 → `cast-vote.html`, everyone else → `dashboard.html`).
- `sidebar.js`'s `NAV_ITEMS` (`roles: [...]` per item) and `initSidebar()` — which nav links a role sees, and a hard redirect if a role-1 voter tries to navigate anywhere except `cast-vote.html`. `admins.html` and `voter-records.html` additionally self-check for role 3 in their own module (`admins.js`, `voter-records.js`) and bounce non-super-admins to the dashboard.

**Auth flow (`js/auth.js`):** The Firebase SDK is dynamically `import()`-ed from the `gstatic.com` CDN only inside the form submit handler — never on page load — to avoid any Firebase usage/metrics until a real login attempt happens. Firebase config lives in `js/firebase-config.js` (imported the same way, lazily). Login is a lookup by ID number against `users/{idNumber}` in the Realtime Database; the "password" is just the user's stored last name, compared case-insensitively client-side. There is no Firebase Auth — this is a plaintext lookup against the DB, so all trust boundaries live in Firebase security rules (not present in this repo) rather than in application code. **Every other page's module repeats this same lazy dynamic-`import()` triple (`firebase-app.js` + `firebase-database.js` + `./firebase-config.js`) inside its own `init*()` function** — there's no shared Firebase-init helper, so if the SDK version (currently `11.0.2`) or import pattern changes, it needs updating in every `js/*.js` file that talks to the DB.

**Session (`js/session.js`):** A thin wrapper around `localStorage` (key `uvdc_session`), storing `{ user, loginTime }`. `getSession`/`setSession`/`clearSession`/`landingPageFor` are the only entry points. `index.html` redirects straight to the caller's landing page if a session already exists (no Firebase call); every other page redirects back to `index.html` via `sidebar.js`'s `initSidebar()` if it doesn't.

**Sidebar (`js/sidebar.js`):** Not just navigation — this is the shared page-init gate. Every non-login page calls `initSidebar(activePage)` first; it returns the session (or `null` after already redirecting) and is the thing each page's module checks before doing any Firebase work. It also injects the mobile off-canvas topbar/backdrop markup (not present in the per-page HTML), wires the theme toggle and logout button, and renders the nav filtered by the current user's role.

**Voting flow (`js/cast-vote.js`):** Gated by `settings/votingOpen` (bool). For role 3, the page renders a voting on/off control instead of a ballot (`set()` on `settings/votingOpen`). For roles 1/2, if voting is closed it shows a "not started" notice; otherwise it checks `votes/{idNumber}` — if a vote already exists it shows a read-only receipt, otherwise it renders the ballot (grouped by `position_key`, only `active: true` candidates). Submission goes through `runTransaction` on `votes/{idNumber}` that aborts if the node is already non-null, so a double-submit (e.g. two tabs) can't overwrite an existing vote — treat this transaction as the single source of truth for "has this person voted," not a client-side flag.

**Results (`js/dashboard.js`, `js/final-results.js`):** Both compute vote counts live by scanning every record under `votes/` and tallying `candidateKey` occurrences per position — they do **not** read `candidates/{key}.votes` (that field in `db.json` is just a static seed value, always `0`, and isn't updated at write time). `dashboard.js` shows per-candidate progress bars against total registered voters (role 3 excluded from the denominator); `final-results.js` shows only the top vote-getter(s) per position, rendering a "Tied" card when more than one candidate shares the top count. Both share the same `POSITION_ORDER` array (canonical position display order) and candidate-photo fallback logic — keep these in sync if you edit one.

**Users/Admins management (`js/users.js`, `js/admins.js`):** `users.html` lists all non-super-admin users with client-side search/filter/pagination and a per-user "voted" flag derived by checking `votes/{idNumber}` existence; role 3 additionally gets an "Add User" modal that writes a new `users/{idNumber}` record. `admins.html` (role 3 only) lists role-2 users and can promote a user to admin (`update role: 2`) or demote back to voter (`update role: 1`) — there's no separate admins table, "admin" is just a role value on the same `users` node.

**Voter records (`js/voter-records.js`, role 3 only):** Same search/filter/pagination list as `users.html` (minus super admins), but each row is clickable and opens a modal reading `votes/{idNumber}` directly, resolving each `position_key` → `candidateKey` pair against `candidates/` to show the candidate's photo, name, and partylist per position (ordered by the same `POSITION_ORDER` convention as the results pages). A user with no `votes/{idNumber}` record shows an empty-state message in the modal instead of a list.

**Theme (`js/theme.js`):** A classic (non-module, non-deferred) script loaded synchronously in `<head>` on every page, before any stylesheet paints, so the saved theme (`localStorage` key `uvdc_theme`, default `dark`) applies with no flash. Exposes `window.UVDC_THEME` (`get`/`set`/`toggle`) used by the theme-toggle button, and fires a `uvdc-theme-change` event on change.

**Styling (`css/styles.css`):** Single shared stylesheet, mobile-first. Theming is done entirely through CSS custom properties on `:root` / `:root[data-theme="light"]` (dark is the default, no media-query fallback) — add new colors as variables there rather than hardcoding.

**Data (`db.json`):** A local snapshot/seed of the Firebase Realtime Database shape, not something the app reads at runtime. Top-level collections:
- `candidates` — keyed `candidate_NNN`, each with `position`/`position_key`, `partylist`/`partylist_key`, `firstname`/`lastname`, `active`, and a `votes` field that is a static seed (see above, not live).
- `users` — keyed by student ID number, each with `idNumber`, `lastName`, `firstName`, `middleInitial`, `course`, `level`, `gender`, `role`.
- `votes` — keyed by voter ID number, each record is `{ idNumber, [position_key]: candidateKey, ... }` — one key per position the voter chose. Written once via transaction, never updated.
- `settings/votingOpen` — boolean toggle controlling whether the ballot is open.

When adding features that read/write votes or users, match these field names exactly (the login lookup depends on `lastName`, the ballot depends on `position_key`/`active`, results depend on `votes/*` shape).

**Candidate photos (`images/`):** Named `{candidateKey}.png` (e.g. `candidate_001.png`), referenced directly by key from `cast-vote.js`, `dashboard.js`, and `final-results.js`. All three attach an `onerror` handler that swaps in `images/default-avatar.svg` — don't rely on every candidate having a real photo file.

## Conventions

- No dependencies are installed locally; the only external libraries (Firebase SDK, Lucide icons, Google Fonts) are pulled from CDNs at runtime via `<script>` tags or dynamic `import()`.
- Icons use Lucide via `<i data-lucide="...">` markup, activated by calling `window.lucide.createIcons()` after any DOM change that adds new icon markup — every page's module does this repeatedly after each `innerHTML` render.
- All user-supplied or DB-sourced text gets passed through each module's local `escapeHtml()` helper before being interpolated into `innerHTML` template strings (there's no shared helper — it's duplicated per file).
