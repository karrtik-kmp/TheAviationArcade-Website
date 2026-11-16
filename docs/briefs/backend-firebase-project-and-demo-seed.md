# Brief to the Backend: new Firebase project, and a seed script for Josh's dev demo

**From:** the website session, 2026-11-16 · **To:** the Backend session · **Rulings:** user, 2026-11-16, full text in
website [`docs/intent/hosting-dev-demo.md`](../intent/hosting-dev-demo.md); also the 11-16 row in root
`docs/PROJECT_STATE.md` §3. Edit only the Backend repo; reply with a message if something here doesn't fit.

## Why

The dev sites (`dev.playairplanegames.com`, `dev.admin.playairplanegames.com`, dev backend on `dev.api.`) are a demo
for Josh, showing his real content. Two things need the Backend for that:

1. The Google account that owned Firebase project `airplane-games-auth-20261022` changed. **`airplane-games-9fe1e`
   replaces it everywhere**, dev and prod. The old project is retired.
2. Staff don't type the desks in by hand. A Backend script loads them from Josh's own files, and the user approves
   and publishes in the Admin.

## Part 1: switch to `airplane-games-9fe1e`

- **Config:** wherever a real project is named, `FIREBASE_PROJECT_ID=airplane-games-9fe1e`. The server template
  `server/backend.env.example` (design-docs folder) already says so. In this repo: the `.env.example` comment (line 7),
  `CLAUDE.md` (line 22), `README.md` (lines 45, 55), `docs/TASKS.md`, `docs/setup/store-credentials.md` (lines 51, 98).
  Local and tests stay on `demo-airplane-games`.
- **Tests:** several tests use `airplane-games-auth-20261022` as "a real, non-demo project" (`config`, `firebase`,
  `role-accounts`, `role-requests`, `store-products`, `stores-check`, `ugs`). Any non-demo id works there. Switch
  them or leave them, your call; don't change what they prove.
- **Old principals:** `account_roles` rows and anything else keyed `firebase:airplane-games-auth-20261022:<uid>` belong
  to a retired project, and nobody can sign in as them again. **Don't rewrite them to the new project**: a principal
  is project + UID, never matched by email (repo rule). On the dev database, revoke or leave them, your choice.
- **First admin:** after the user signs up on `dev.` (new project), the user runs `npm run roles:grant` on the dev
  backend once. Nothing to build, just make sure the README step names the new project.
- **Demo account:** `DEMO_ACCOUNT_UID` needs the new project's demo account UID. The user creates the account, then
  sets the UID on the backend and both web fronts.
- **UGS:** the Player Authentication OIDC provider `oidc-firebase` still has Client ID and issuer
  `airplane-games-auth-20261022` (root `docs/ugs-setup.md`, flagged ⚠️). The user changes it in the UGS dashboard to
  `airplane-games-9fe1e` / `https://securetoken.google.com/airplane-games-9fe1e`. Then re-run `ugs:check --live` with a
  test user's token from the new project, and record the result.
- **Store credentials:** if the Google Play service account lived in the old project, check it still works. If it's
  in `airplane-games-play` (the recommended setup), it's unaffected.

## Part 2: the demo seed script (scenario E4)

A new npm script (name it as you see fit, e.g. `demo:seed-content`) for the **dev backend only**.

**What it loads: only client-delivered content**, from the design-docs folder (root `docs/`):

- **Military:** `Military Airplane Identifier v1.xlsx` (31 rows, ids `mil-a1`…`mil-a31`) and its pictures folder.
  Licence per Josh: Unsplash License. `mil-a5` (C-17) has no photo, so leave it without one and say so in the output;
  don't source a replacement.
- **Photos** are uploaded through backend media **under the staff photographer account** (WC-3), with rights statement
  v1, so they show the right owner and can be published. Credit as the client files give it; if they give none, say so.
- **Photographer roles:** take a list of Firebase UIDs (argument or file) for the real photographers, who sign up on
  `dev.` first. Grant `photographer` through the same audited path `roles:grant` uses. Refuse the demo account and
  any UID that isn't in `airplane-games-9fe1e`. Never look up users by email.

**How it behaves:**

- Reuse the existing write paths: the module xlsx import (`src/content/xlsx.ts`, `src/content/modules/military.ts`),
  backend media and role grants. No second way of writing content.
- A dry run by default that prints what it would do; `--yes` applies it (the same shape as `media:import`). It refuses a
  production `APP_ENV` and a `demo-` project.
- Safe to re-run: existing ids are updated by the import rules Q1–Q9 (confirm-before-overwrite) and never duplicated.
- It **leaves everything for a person to approve.** Items land in the preparation stage the import gives them, and
  photos land as drafts. The user approves and publishes in the Admin. The script never publishes or activates a
  release.

## Aircraft Identifier and Plane of the Day (checked 2026-11-16)

Root `docs/content-sources.md` has the details.

- **Aircraft Identifier: delivered as a Google Sheet, not a file.** "Airplane Identifier"
  (`1vbost9phqEwrWPEX331XLwp0sjcL97FZmXvV6DZTAn0`, link in `content-sources.md`), 241 questions in rows 4–244.
  Columns: Level (rank name), Correct Answer, Wrong Answer 1–3, file, Image Link (a Google Photos share link on every
  row).
  - **There is no import module for it yet**: `src/content/modules/` has `airport-spotter` and `military` only. Add one
    on the same xlsx path, reading an `.xlsx` export of the sheet that the user saves into root `docs/`, so the
    import stays a file like the others.
  - **Photos:** don't scrape Google Photos. The user (or Josh) exports the albums into a folder in root `docs/`. The
    seed matches photos by file name, but only rows 4–36 have one (`ai-a1`…`ai-a31`), so the rest need a mapping
    from Josh first. Until then, those rows import with no photo, and their photo-less state is reported, not filled.
  - **Licence and credit aren't stated** in the sheet. Ask the user before publishing them; that's a client question.
  - **Data issues** (wrong answers that repeat, spelling, a photo shared by two questions; listed in
    `content-sources.md`): import as delivered and report each one. Don't correct client text. A question whose
    wrong answers aren't 3 distinct values can't be published (scenario D5), so the desk shows it as blocked.
- **Plane of the Day:** by design it's photographer content (concept deck: the photographer's image,
  make/model/variant, description, name and Instagram), so there is **no client file to seed**. It comes from the
  real photographers' uploads on `dev.`. The user publishes one and schedules it in the Admin. Nothing to build in
  the seed.

**Never fill any desk with made-up or stock content.** The Unity session keeps the one client-question list
(`docs/implementation/CLIENT_CONTENT_IMPORT.md`); the Unity brief asks it to log these.

## Done when

- The dev backend boots with `FIREBASE_PROJECT_ID=airplane-games-9fe1e` and accepts an ID token from that project.
  It refuses one from `airplane-games-auth-20261022`.
- On the dev database, the seed's dry run lists:
  - the 31 Military rows and their 30 photos (C-17 missing)
  - the 241 Aircraft Identifier questions, with the photo and data issues reported
  - the role grants

  `--yes` applies them, and a second run changes nothing.
- The Admin's Military and Aircraft Identifier desks on `dev.admin.` show the rows, waiting for approval.
- Tests cover the refusals: production, demo project, demo account, foreign-project UID.
- Report what was verified and what wasn't (e.g. `ugs:check --live` waits on the user's UGS change).
