# UV Dalaguete Campus Voting System

A student council voting portal for the **University of the Visayas — Dalaguete Campus**. Built as a plain static site (no framework, no bundler, no build step) backed by a Firebase Realtime Database.

## Features

- **Simple sign-in** — students log in with their ID number and last name (no separate password to remember).
- **Ballot casting** — vote once per position; ballots are reviewed before submission and locked after the vote is cast.
- **Live results dashboard** — real-time vote counts and progress bars per candidate.
- **Final results** — the leading candidate (or a tie) for each position.
- **User management** — searchable, filterable, paginated list of registered users and their voting status.
- **Admin management** — super admins can promote/demote users to admin.
- **Voting control** — super admins can open or close voting campus-wide.
- **Light/dark theme**, mobile-friendly layout with a collapsible sidebar.

## Roles

| Role | Value | Access |
|---|---|---|
| Voter | `1` | Cast Vote only |
| Admin | `2` | Dashboard, Final Results, Cast Vote, Users |
| Super Admin | `3` | Everything above, plus Admins management and voting on/off control |

## Getting started

There's nothing to install and nothing to build.

1. Clone or download this repository.
2. Serve the folder with any static file server, since the pages load their scripts as ES modules (some browsers block `type="module"` under `file://`):
   ```
   npx serve
   ```
   or use an equivalent tool such as the VS Code Live Server extension.
3. Open the served `index.html` in your browser and sign in.

## Tech stack

- Plain HTML, CSS, and JavaScript (ES modules) — no frameworks or build tooling.
- [Firebase Realtime Database](https://firebase.google.com/docs/database) for all data (users, candidates, votes, settings).
- [Lucide](https://lucide.dev/) for icons and [Google Fonts](https://fonts.google.com/) (Inter), both loaded from CDNs at runtime.
- Deployed to GitHub Pages automatically on push to `main` via GitHub Actions.

## Project structure

```
index.html            Login page
dashboard.html         Live results (admin+)
cast-vote.html         Ballot / voting control
users.html             User list & management
voter-records.html      Per-voter vote lookup (super admin)
admins.html             Admin management (super admin)
course-monitoring.html  Per-course/year voting status (super admin)
final-results.html      Final results / winners
css/styles.css          Shared stylesheet (light + dark themes)
js/                    Page scripts, session, theme, and Firebase config
images/                 Candidate photos + default avatar
db.json                Local snapshot of the database shape (seed reference, not read at runtime)
```

## Data model

Data lives in a Firebase Realtime Database with these top-level nodes:

- `users/{idNumber}` — student/admin records (`idNumber`, `lastName`, `firstName`, `middleInitial`, `course`, `level`, `gender`, `role`).
- `candidates/{candidateKey}` — candidate records (`position`, `position_key`, `partylist`, `partylist_key`, `firstname`, `lastname`, `active`).
- `votes/{idNumber}` — one record per voter, written once (`{ idNumber, [position_key]: candidateKey, ... }`).
- `settings/votingOpen` — boolean flag controlling whether voting is open.

There is no Firebase Auth — trust boundaries are expected to be enforced through Firebase security rules (configured separately, not included in this repo), since the client performs direct reads/writes against the database.

## Notes

- There are no automated tests or a lint configuration.
- Contact your campus COMELEC for account or access issues — this repo does not include a way to self-register.
