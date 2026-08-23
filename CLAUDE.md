# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A student council voting portal for the University of the Visayas — Dalaguete Campus. Plain static HTML/CSS/JS (no framework, no bundler, no `package.json`) backed directly by a Firebase Realtime Database.

## Running it

There is no build step. Open `index.html` directly, or serve the folder with any static file server (e.g. `npx serve` or the VS Code Live Server extension) since `js/auth.js` and `js/dashboard.js` are loaded as ES modules (`type="module"`), which some browsers block under `file://`. There are no tests and no lint config.

## Architecture

**Two pages, both gated by a client-side session check:**
- `index.html` — login page. Loads `js/auth.js` as a module.
- `dashboard.html` — post-login landing page (voting UI itself is not yet built). Loads `js/dashboard.js`.

**Auth flow (`js/auth.js`):** The Firebase SDK is dynamically `import()`-ed from the `gstatic.com` CDN only inside the form submit handler — never on page load — to avoid any Firebase usage/metrics until a real login attempt happens. Firebase config lives in `js/firebase-config.js` (imported the same way, lazily). Login is a lookup by ID number against `users/{idNumber}` in the Realtime Database; the "password" is just the user's stored last name, compared case-insensitively client-side. There is no Firebase Auth — this is a plaintext lookup against the DB, so all trust boundaries live in Firebase security rules (not present in this repo) rather than in application code.

**Session (`js/session.js`):** A thin wrapper around `localStorage` (key `uvdc_session`), storing `{ user, loginTime }`. `getSession`/`setSession`/`clearSession` are the only entry points — both pages import from here rather than touching `localStorage` directly. `index.html` redirects straight to the dashboard if a session already exists (no Firebase call); `dashboard.html` redirects back to `index.html` if it doesn't.

**Theme (`js/theme.js`):** A classic (non-module, non-deferred) script loaded synchronously in `<head>` on both pages, before any stylesheet paints, so the saved theme (`localStorage` key `uvdc_theme`, default `dark`) applies with no flash. Exposes `window.UVDC_THEME` (`get`/`set`/`toggle`) used by the theme-toggle button in both page's inline scripts, and fires a `uvdc-theme-change` event on change.

**Styling (`css/styles.css`):** Single shared stylesheet, mobile-first. Theming is done entirely through CSS custom properties on `:root` / `:root[data-theme="light"]` (dark is the default, no media-query fallback) — add new colors as variables there rather than hardcoding.

**Data (`db.json`):** A local snapshot/seed of the Firebase Realtime Database shape, not something the app reads at runtime. Two top-level collections:
- `candidates` — keyed `candidate_NNN`, each with `position`/`position_key`, `partylist`/`partylist_key`, `votes`, `active`.
- `users` — keyed by student ID number, each with `idNumber`, `lastName`, `firstName`, `middleInitial`, `course`, `level`, `gender`, `role`.

When adding features that read/write votes or users, match these field names exactly (the login lookup already depends on `lastName` under `users/{idNumber}`).

## Conventions

- No dependencies are installed locally; the only external libraries (Firebase SDK, Lucide icons, Google Fonts) are pulled from CDNs at runtime via `<script>` tags or dynamic `import()`.
- Icons use Lucide via `<i data-lucide="...">` markup, activated by calling `window.lucide.createIcons()` after any DOM change that adds new icon markup (see the loading-spinner swap in `auth.js`).
