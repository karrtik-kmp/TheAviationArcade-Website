# Final integration: scenarios and start conditions

**Written:** 2026-11-13 by the website session · **Covers:** server hosting A3 (D1 out), A4 (sign-in on the new
domains) and A5 (cut-over), dev sites first (`dev.playairplanegames.com`, `dev.admin.playairplanegames.com`, dev
backend on loopback `:3001`). Brief: [`../../docs/briefs/website-admin-hosting.md`](../../docs/briefs/website-admin-hosting.md).

"Final integration" here means that the website and the Admin run as Node processes on our server, read and
write only through the game backend, and keep no database of their own. This file fixes **what must be true
before the work starts** (§1–§2), **the scenarios that define done** (§3) and **the order** (§4). Each scenario
says where it can be proven: **L** = local (Node build, local backend, Auth emulator), **D** = hosted dev sites.

## 1. Where things stand (checked 2026-11-13)

| Area | State | Source |
|---|---|---|
| Website runtime | A1 runtime seam and A2 Node build done (`cb16530`, `71592a7`). D1 desks answer 503 until A3 | `lib/server.ts`, TASKS "Server hosting" |
| Backend content endpoints | **All built.** W1 editorial desks + public Plane of the Day (0.23.0), W3 Military preparation (0.24.0) and releases (0.25.0), W4 audit read (0.26.0) | Backend TASKS 5.S, `docs/plans/website-content.md` |
| Vendored contract | Website and Admin both at **0.22.1**; backend is at **0.26.0** | `contracts/openapi.yaml` |
| Admin repo | `H:\Work\TheAviationArcade\Admin`, one commit (`e4b2ef5`, 11-05 16:04), split from `cb16530`: **before A2**, no remote | Admin `README.md` |
| Server | Scripts ready; `web-deploy.sh` deploys **both** web fronts from the website repo (`WEBSITE_BRANCH`). One deploy key per repo (`id_backend`, `id_website`) | `../../server/README.md` |
| DNS | `api`, `dev.api`, `admin`, `dev.admin` → server. **Apex, `www`, `dev` → registrar parking, not the server** (checked 11-05) | `../../server/README.md` |
| Remaining D1 code | `lib/d1/*`, `lib/editorial/{d1-store,content-d1}.ts`, `lib/submissions/{d1,export}.ts`, router/route wiring | `git grep` |
| Backend rulings that change website rules | WC-1 no per-use usage offers (published media = every use); WC-2 D1 desk records **recreated, not migrated** (no id map); WC-3 client photos uploaded by a staff photographer account; WC-4 audit desk stays | Backend plan `website-content.md` |

## 2. Decisions to lock before starting

Each needs a yes from the user; the recommendation is listed first.

**Locked 2026-11-13 (user):** I-1 separate Admin repo · I-2 `dev` → dev sites, `main` → prod · I-3 adopt WC-1.

**Locked 2026-11-16 (user), full text in [`intent/hosting-dev-demo.md`](intent/hosting-dev-demo.md):** the dev sites
are Josh's demo, showing his real content.
- **I-4:** nothing is migrated. Export D1 to a local backup, then delete D1 after the demo works, with the user's yes at that point.
- **I-5:** a Backend script loads the desks from Josh's files and grants photographer by UID after each photographer
  signs up on `dev.`. The user approves and publishes.
- **I-6:** a shared IP is fine for dev, and must be fixed before the public launch.
- **I-7:** the user points `dev` DNS at the server now, then sets up the Firebase domains, Google sign-in and the
  first admin on the new project.
- **New ruling:** Firebase project `airplane-games-9fe1e` replaces `airplane-games-auth-20261022` everywhere.

The table below is the question as it was asked on 11-13.

| # | Question | Recommendation | Why it blocks |
|---|---|---|---|
| **I-1** | **Which repo serves the Admin?** The 11-05 ruling made the Admin its own repo, but A2 (16 minutes later) still builds it from the website via `SITE_SURFACE=admin`, and `web-deploy.sh` expects that | Keep the separate Admin repo (the user's ruling). Port A1/A2 into it, then remove `/admin`, admin API routes and `SITE_SURFACE=admin` from the website. Server: an `ADMIN_REPO`/`ADMIN_BRANCH` and a third deploy key (`id_admin`) in `setup.conf` | Every A3 desk would otherwise be built twice or in the wrong repo |
| **I-2** | Deploy branches: the user said they'll create `dev` and `main`. Which branch does `dev.` deploy, and does `codex/cloudflare-prototype` merge into it? | `dev` deploys the dev sites, `main` the prod ones; merge the current branch into `dev` once A3 passes locally | `WEBSITE_BRANCH` in `setup.conf` |
| **I-3** | ⚠️ WC-1 replaces the website rule "publishing needs approval and usage offers" (root `CLAUDE.md`, `AGENTS.md`). Adopt it? | Yes: publishing needs approval and a **published** photo (rights v1, licence, credit when required); no per-use offers. Update both rule sheets in the same change | Changes the publish check in the Aircraft Identifier and Plane of the Day desks |
| **I-4** | Old D1 photographer proposals (D-2 amended 11-04): when do they migrate, and where to first? | Rehearse into the **dev** backend first (`media:export --remote` → backend `media:import` dry run → `--yes`), prod later. Needs the Cloudflare D1 database kept (read-only) until prod is migrated | The export reads Cloudflare D1; deleting it first loses the data |
| **I-5** | Desk records (Military preparation, Identifier, Plane of the Day) are recreated by staff (WC-2). Who does it, and on which backend? | Staff recreate on **dev** to prove the desks, and again on prod at launch; client photos uploaded once per backend by the staff photographer account (WC-3) | Defines what "the desks work on dev" means |
| **I-6** | Guest traffic: the website reaches the backend over loopback, so every visitor shares one IP for the backend's public rate limit (`GET /v1/public/plane-of-the-day`, `/v1/public/media`) | Accept for dev sites. Before the public apex launches, the backend adds a trusted website key or the website caches the public read (≤ 1 h, serve cached on 429) | Public Plane of the Day under load |
| **I-7** | User-only actions (console and DNS) | User does: Firebase authorized domains for the four web hosts (A4); Google sign-in config per `FIREBASE_SETUP.md`; DNS for apex/`www`/`dev`; first admin via `roles:grant` on the dev backend; `DEMO_ACCOUNT_UID` set on both web fronts and the backend | Sign-in on `dev.` and the dev site's certificate |

## 3. Scenarios that define done

### A. Hosting and surfaces

| # | Scenario | Expected | Proof |
|---|---|---|---|
| A1 | `GET /api/health` on each web process | 200, no auth | L, D |
| A2 | Website build started with `SITE_SURFACE` other than `public`; Admin build with anything but `admin` | Refuses to start (each build serves only its own site since I-1) | L |
| A3 | Public host asked for `/admin`, `/api/admin/*`; Admin host asked for `/contribute`, `/account`, `/api/featured` | 404, including encoded paths (`/api/%61dmin`) | L, D |
| A4 | Admin host `/` | nginx redirects to `/admin` | D |
| A5 | Signed in on `dev.` then open `dev.admin.` | Separate host-only cookies: not signed in on the other host; no `Domain=` cookie | D |
| A6 | `SIGTERM` | Clean exit within 20 s; pm2 restarts it | L |
| A7 | Admin account menu "Account" / "Contribute"; website staff link "Editor workspace" | Each goes to the other host (Admin `37be738`; website `lib/admin-site.ts`), never a path on its own host | L, D |
| A8 | Any page | Sets its own CSP/frame-ancestors; HSTS from nginx; no Cloudflare request anywhere | D |

### B. Sign-in and roles (`ROLES_SOURCE=backend`)

| # | Scenario | Expected | Proof |
|---|---|---|---|
| B1 | Email/password sign-up, verify, sign in, sign out, reset on `dev.` | Works against `airplane-games-9fe1e` | D (L on emulator only) |
| B2 | Google sign-in on `dev.` and `dev.admin.` | Works on each host; **must be checked by a person**, not inferred from the emulator | D |
| B3 | Admin with a verified email signs in on `dev.admin.` | All desks visible | L, D |
| B4 | Signed-in player (no role) opens `dev.admin.` | Denied; nothing staff-only rendered or returned | L, D |
| B5 | Admin with an unverified email | No staff access | L |
| B6 | Demo account | View-only on the Admin; never photographer/admin even if a row exists | L, D |
| B7 | Backend down or roles unreadable | Staff and photographer areas fail closed; public pages stay up with their empty/unavailable states | L, D |
| B8 | Sign-in role picker set to "admin" by a player | Grants nothing | L |
| B9 | Account changes in another tab during a write | Session-generation guard and account-change fence stop the write; never retried under the new account | L |

### C. Photographer path (public site → Admin)

| # | Scenario | Expected | Proof |
|---|---|---|---|
| C1 | Player requests photographer access on `/contribute` | Request shows in Admin Users; approve → photographer on next request | L, D |
| C2 | Photographer uploads a photo (≤ 5 MB), states rights v1, sets licence | Stored in the backend/Bunny; draft only | L, D (real Bunny on D) |
| C3 | Admin publishes it in the Media desk; later withdraws it | Published version live with credit; withdraw removes it from public reads | L, D |
| C4 | Blocked photographer opens `/contribute` | `PHOTOGRAPHER_BLOCKED` copy, no upload | L |
| C5 | Old D1 submission routes | 404 `SUBMISSIONS_CLOSED` | L |

### D. Admin desks on the backend (A3)

| # | Scenario | Expected | Proof |
|---|---|---|---|
| D1 | Military desk lists the client's 31 rows (`mil-a1`…`mil-a31`) with preparation stage and `stale` flag | Read from `/v1/admin/content/aircraft-identifier-military/...`; no D1 | L, D |
| D2 | Move a Military item through the preparation stages | CAS on the item version; one audit row per change; at stage 1+ a photo that isn't published or is demo-owned is refused with its reason | L |
| D3 | Two admins edit the same item | Second save gets 409 → desk reloads and keeps the user's input visible; never resent | L |
| D4 | Military release: upload a candidate from chosen items, then activate, then restore | Refusals (unapproved item, changed item, shared photo hash, coverage) shown as reasons. Activation is **recorded, not delivered** to the game; the desk must say so | L |
| D5 | Aircraft Identifier: create a draft from a published photo, save with base version, publish | Exactly 3 distractors; publish needs approval and a published photo (I-3); demo content never publishable | L, D |
| D6 | Plane of the Day: schedule an item for a date, publish | Appears on the public site on that local date (D7) | L, D |
| D7 | Public Plane of the Day page and archive, viewer in UTC−10 and UTC+14 | Today's item by the viewer's IANA time zone, archive newest first, licence credit shown, signed image | L, D |
| D8 | Nothing scheduled for today / backend down | Public empty or unavailable state; no error page | L |
| D9 | Audit desk | Latest 50 rows; actor is a principal, never an email; free-text fields as the contract projects them | L, D |
| D10 | Store desk (Products, Purchases, Player pass) and Users desk | Unchanged behaviour on the dev backend (regression) | L, D |
| D11 | Store desk on a backend with `STORE_VERIFIER=none` | Desk reads still work; no purchase is faked | D |

### E. Data and retirement

| # | Scenario | Expected | Proof |
|---|---|---|---|
| E1 | `git grep` for D1, `cloudflare:workers`, `wrangler` in both repos | No runtime use left; D1 export tool is the only exception until I-4 is done | L |
| E2 | D1 read-only export (`media:export --remote`) to a local backup | The export file exists and is kept outside the repo. No import (I-4: nothing is migrated) | L |
| E3 | Cloudflare Worker, D1 database and secrets | Deleted **only** after E2 and the dev demo works, with an explicit user yes at that point | — |
| E4 | Backend seed script on the dev backend | Desks hold Josh's client files (31 Military rows `mil-a1`…`mil-a31`, his photos under the staff photographer account). Real photographers hold the photographer role by UID after signing up on `dev.`. Nothing Claude-drafted | D |

### F. Copy rules (unchanged)

| # | Scenario | Expected | Proof |
|---|---|---|---|
| F1 | Every public page on `dev.` | No play, "how to play", Flight/Trip mechanics, purchases, prices or subscriptions; no invented forum links or release dates | L, D |
| F2 | Store desk | Staff-only; nothing offered to visitors | L |

## 4. Order

1. Lock I-1 … I-7 (done 11-13 and 11-16). User now: `dev` DNS to the server. Briefs: the Backend seed script
   (E4) and new project ID, and Unity if the game signs in with Firebase.
2. Vendor contract 0.26.0 into the repo(s) that I-1 names; if the Admin stays separate, port A1/A2 into it first.
3. A3 desk by desk, each a focused commit with unit tests: Plane of the Day (desk + public read) → Aircraft
   Identifier → Military preparation → Military releases → audit. Delete the matching D1 code with each desk.
4. Trim the website (I-1) and fix A7.
5. Local run of all of §3 marked L, both surfaces on the Node build against a local backend and the Auth emulator.
   Record the results in `docs/evidence/`.
6. Plan-review gate on the A5 cut-over steps, then deploy `devwebsite` and `devadmin`; run §3 marked D. Google
   sign-in (B2) is checked by a person on each host.
7. Once Josh has seen the demo: E3 (delete D1, after E2's backup and the user's yes). Prod (`website`, `admin`)
   waits for a separate go-ahead.

## 5. What these runs cannot prove

- Local runs don't prove live Google sign-in, real email delivery, real Bunny delivery or nginx/TLS behaviour.
- Dev-site runs don't prove prod: different backend, database and certificates.
- Releases being activated on the backend doesn't mean the game gets them; delivery is a later backend slice (5.Q).
