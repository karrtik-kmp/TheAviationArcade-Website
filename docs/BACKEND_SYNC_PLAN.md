# Backend sync and UGS-ready architecture plan

**Status:** proposed 2026-10-28; re-scoped 2026-10-29 to the user's rulings C1–C5, C12 and D-1–D-5
(recorded in `H:\Work\TheAviationArcade\docs\PROJECT_STATE.md` §3). Covers the three codebases that
must agree:

| Repo | Path | Role |
|---|---|---|
| Website/admin | `H:\Work\TheAviationArcade\website` | Cloudflare Worker, D1, Bunny (private), Firebase sign-in, photographer submissions, editorial desks |
| Game backend | `H:\Work\TheAviationArcade\Backend` | NestJS + Postgres, Firebase ID tokens, authoritative economy and editorial content. Local only, no host yet |
| Game | `C:\Unity\Projects\AviationArcade_v2` | Unity app. Plays against `InProcessMockBackend`; moving to the backend under ADR-0008 |

**Rulings this plan follows:**

- **Postgres is the only writer** of Miles, Status Points, rank, hints and entitlements. No UGS Economy.
- **C1 / D-2:** backend Postgres owns game content: Military, Aircraft Identifier and Plane of the
  Day, from draft to live. The website desks become clients of the backend admin API. Photographer
  submissions stay in website D1 as community data.
- **C3 / D-1:** the game shows the server-written UGS copy first, then checks the server. A higher
  server `version` wins on screen and the backend re-queues the copy write. Any change visible in
  the copy bumps `version`.
- **C4:** the backend verifies store receipts itself. Cloud Code is adopted but not in the purchase
  path; it is a candidate for leaderboard writes only.
- **C5:** the backend owns the server Trip contract (`POST /v1/trips`) in its `openapi.yaml`.
- **C12:** the backend records and Unity receives. Field Award progress, Go Around and Logbook history
  are recorded on the backend. Admin changes (content, the Field Award catalog and thresholds) flow
  backend → Unity as data.
- **D-5:** Unity `ModuleRegistry` is the origin of module ids and ranks; the backend mirrors it and
  publishes `catalog.v1.json`.

Every step below has its own gate and needs its own sign-off where it touches cloud, hosting or Bunny
accounts. This repo edits only the website; items for the other repos go to their sessions as messages.

## 1. Starting point (2026-10-29)

- **Identity is shared.** All three use Firebase project `airplane-games-auth-20261022` and the
  principal `firebase:<projectId>:<uid>`, with `demo-airplane-games` locally. The website session
  cookie (`aa_session`) holds the Firebase ID token itself (max 1 h). The backend accepts the same
  token, so the Worker can call it server-to-server without a new trust mechanism.
- **Backend:** Phase 1, the Miles ledger and hint bank are done locally. Uncommitted and not yet
  reviewed: staff admin routes (5.0: `GET /v1/admin/me`, and import, export and item listing under
  `/v1/admin/content/{module}`) and the Cloud Save progress copy (5.1). It has no releases, no Trip
  and no host yet. Its contract is `Backend/docs/openapi.yaml`.
- **Unity:** HTTP services call the frozen mock contract, not the backend. `IAccessTokenProvider` has
  no Firebase implementation. UGS seams (`IAnalyticsSink`, `IRemoteControlService`,
  `IGamingServicesSession`) were written by a website session and are uncommitted; under C11 the Unity
  owner session decides what lands.
- **Website:** the Military desk sits behind `EditorialStore` (W1, D1 adapter) with release candidates
  separate from live. Every API request resolves one `RequestPrincipal` and runs through a declared
  route table (W2). `/play` still shows `lib/player-mock.ts`.

## 2. Target topology and ownership

```
                 Firebase Auth  (airplane-games-auth-20261022)
                   │ ID token                         │ ID token (cookie, forwarded as Bearer)
                   ▼                                  ▼
   Unity app ──────────────►  Game backend  ◄──────── Website Worker
   (cache + outbox)  /v1/me,   NestJS + Postgres       /v1/me/progress (members)
                     /v1/trips   │                     /v1/admin/content/… (staff)
                     /v1/content │ server-written copy     │
                                 ▼                         ▼
                       UGS Cloud Save (Protected)     D1: photographer submissions,
                       read first by the game         audit. Bunny (private): their photos
```

One owner per kind of data. Everyone else holds a copy derived from that owner, or a read-through.

| Data | Authoritative owner | Others |
|---|---|---|
| Account identity, credentials, provider linking | Firebase | Principal string only |
| Miles, Status Points, Certified/Active Rank, Flights, hints, entitlements | Backend Postgres | Unity: account-scoped cache + outbox. Website: per-request read-through, no storage. UGS: server-written Cloud Save copy, shown first by the game; the server wins on a higher `version` (C3) |
| Field Award progress, Go Around, Logbook history | Backend Postgres (C12) | Unity: cache only |
| Game content (Military, Aircraft Identifier, Plane of the Day): drafts, preparation evidence, approvals, releases, which release is live | Backend Postgres (C1, D-2) | Website desks: clients of the backend admin API. Unity: receives the live release |
| Field Award catalog and thresholds | Backend (C12) | Unity receives them as data |
| Photographer submissions, their photos, review history | Website D1 + private Bunny (D-2) | Backend: whatever a migration or content item references (open, §7) |
| Module ids, ranks | Unity `ModuleRegistry` (D-5) | Backend mirror + `catalog.v1.json`; website catalog `backendId` |
| Device settings (vibration, motion, audio) | Unity local | None |
| Callsign / public game identity | **Undecided** (backend Phase 7) | Nobody shows one as linked until decided |
| Analytics events | Derived only | UGS Analytics as an adapter; never read back for rewards |

**Rule:** if a value can change a balance, a rank or a grant, it is read from the backend at the
time it matters. Everything else is a cache that can be dropped.

## 3. Seams

### The website's two seams to the backend

1. **`RequestPrincipal`** (`lib/request/principal.ts`, W2). One verification per request. A member
   carries a `Bearer` (their own Firebase ID token) that never serializes. **`BackendClient`** (W6)
   takes it and calls the backend with `Authorization: Bearer`; there is no service secret and no
   browser CORS. Staff calls carry the staff member's own token, so the backend audit names the person.
2. **`EditorialStore`** (`lib/editorial/store.ts`, W1). `list`, `saveDraft`, `upload` (an immutable
   candidate, "uploaded") and `activate` (makes a candidate live only if nothing changed since upload),
   plus `restore`. Adapters: D1 today, the backend admin API later (W7), selected per desk. The
   contract suite in `tests/editorial-store.contract.mjs` runs against every adapter.

### S1 Identity — finish wiring, no new design

Decided in Unity ADR-0006 (D1–D7) and the backend README.

- **Unity:** Firebase Unity SDK, `FirebaseAccessTokenProvider` (refresh once on 401, then
  re-authenticate), `Authorization` and `X-Client-Version` headers, a per-build base URL, and
  account-scoped stores behind the session-generation fence.
- **Website:** no sign-in change. Publish the account-deletion URL Google Play requires (ADR-0006 D3):
  re-authenticate, `DELETE /v1/me` on the backend, then the Firebase delete. Retention of the member's
  website D1 rows (submissions, audit) is still open.

### S2 Website reads player progress (read-through, W6)

- The Worker calls `GET {GAME_API_BASE_URL}/v1/me/progress` with the member's `Bearer`. No stored copy.
- **The website never calls `PUT /v1/me`.** The app creates players. A 404 `player_not_found`
  renders as "No app progress yet", without a fake rank.
- 401 means refresh the session (the account fence applies); 503 or 429 shows a retry state using
  `Retry-After`. The progress DTO includes `version` (D-1).
- `ProgressSource` replaces `lib/player-mock.ts`, with a mock adapter for local work. No Callsign
  until Phase 7.
- Website reads share the player's per-principal rate limit; fine at page-view volume.
- The backend's `X-Client-Version` gate applies to `/v1/me/progress`, but the website is not an app
  build. Asked of the backend session (§7).

### S3 Game content: the backend owns it, the website edits through it

- **Admin API.** The website desks call `/v1/admin/content/{module}/…` through the Worker with the
  staff member's token. The backend checks `email_verified` plus its own staff allowlist, the same
  rule as the website's `STAFF_EMAILS`. Today it offers import (dry run, then confirm), item listing
  and export. The website's backend adapter (W7) reads and transfers sheets; edits and releases stay
  unsupported until the backend ships them.
- **Releases (asked of the backend for 5.2+).** "Uploaded" stays separate from "live": a release
  candidate is immutable, activation is its own call, and rollback activates an earlier candidate
  after re-checking rights, so a withdrawn photograph cannot come back. The website's D1 adapter
  already behaves this way, and the contract suite is the shared definition.
- **Migration (W8, C1).** The D1 Military desk and its `military_release` records move to the
  backend and the D1 copy is retired. The export must include each package's preparation evidence and
  the linked photographer submissions and their photos (or say how the backend ingests them), and the
  counts and digests are compared before the switch. Blocked on the backend's release and edit
  endpoints and on where preparation evidence lives (§7).
- **Server Trip (C5).** The backend owns `POST /v1/trips` and writes it into `openapi.yaml`; the
  website does not sketch it. The server checks answers (decided 2026-10-28): the dealt deck omits
  the answer key and the result returns the correct answer for the reveal.
- **App delivery.** The game receives the live release from the backend (manifest route); Unity's
  `HttpContentManifestService` state machine and `IContentCache` stay as they are.

### S4 Shared catalog and contract parity (D-5)

- The backend publishes `contracts/catalog.v1.json` (module BackendIds, ranks, thresholds) from its
  mirror of `ModuleRegistry`.
- The website vendors it, adds `backendId` to each `lib/catalog.ts` entry (Military:
  `aircraft-identifier-military`; the URL slug stays) and tests the two against each other. The
  website stops dealing its own sample Trips once the backend deals them.
- No monorepo and no shared package: a vendored JSON file plus a test per repo.

## 4. UGS (adapters; the backend stays authoritative)

**Invariant:** no UGS service is a source of truth for Miles, Status Points, rank, Flights, hints or
entitlements, and the game never writes them to UGS.

- **Progress copy (C3, D-1, D-4):** the backend writes Cloud Save player data, Protected access class,
  key `progress` (`schemaVersion`, `version`, `statusPoints`, `miles`, `hints`, `perfectStreak`,
  `certifiedRank`, `activeRank`, `firstClassUntil`, `updatedAt`). The game shows it first, then checks
  the server; a higher server `version` wins and re-queues the write. One shared write budget in
  Postgres for every backend instance.
- **Link:** after the Firebase sign-in, `SignInWithOpenIdConnectAsync("oidc-firebase", idToken)`, then
  `PUT /v1/me/ugs-link { ugsToken }` with the Firebase Bearer. The server proves the link; the game
  never sends a player id. Errors: 403, 409 `ugs_link_conflict`, 503 retry.
- **Purchases (C4):** UGS IAP on the device; the backend verifies receipts with the stores and grants
  nothing unverified. Cloud Code is not in this path.
- **Remote Config:** a restrict-only switchboard (maintenance, disabled modules). It can take a game
  away, never enable one.
- **Content delivery (later):** a CCD bucket is a candidate once releases exist on the backend.

| Service | Status | Constraint |
|---|---|---|
| Cloud Save | Adopted: server-written progress copy | Game reads (Protected class), never writes progress |
| Remote Config | Adopted: restrict-only switches | Must not duplicate content availability |
| IAP | Adopted | Receipts verified by the backend (C4) |
| Analytics | Adopted as a seam | Events only; consent and privacy copy first |
| Cloud Code | Adopted, not needed yet | Leaderboard writes only; not in purchases |
| Leaderboards | After the Phase 7 identity ruling | Scores written by the backend, never the client |
| Push | When Plane of the Day reminders are approved | Compare with Firebase Cloud Messaging |
| Economy | Not adopted | Conflicts with Postgres authority |

## 5. Drift

| # | Where | Fix | Status |
|---|---|---|---|
| D1 | `website/lib/catalog.ts` | Add `backendId`; Military → `aircraft-identifier-military` | Website W7 (with the vendored catalog) |
| D2 | `website/lib/player-mock.ts` | Ranks must be Trainee, First Officer, Captain, Check Airman, Chief Pilot | Fixed 2026-10-29; the mock is replaced in W6 |
| D3 | Backend `CLAUDE.md` vocabulary | Round = one **Flight**, Flight Segment = **Trip** (Unity ADR-0007) | Backend session |
| D4 | Unity `ApiClientConfig` | Default `127.0.0.1:8787` is the retired Worker; per-build base URL | Unity session |
| D5 | Field Awards source | `docs/Field Awards #1.xlsx` (28 rows) | Settled 2026-10-28 |
| D6 | Unity manifest | UGS packages restored | Done 2026-10-28 |

## 6. Phases

Each phase ends with evidence in the owning repo's `TASKS.md`. Local evidence never claims hosted or
live-Google behaviour.

| Phase | Work | Repos | Gate (evidence) | Blocked on |
|---|---|---|---|---|
| **P0 Align** | D1–D4; `catalog.v1.json` + parity tests; website W1/W2 (done) | all | Parity tests pass in each repo | — |
| **P1 App → backend** | Firebase SDK, token provider, headers, backend adapters, account-scoped stores | Unity | ADR-0006 A→B→A isolation tests with fakes; a device banks a Flight and replays safely | Android SHA fingerprints, Apple Team ID |
| **P2 Website progress** | S2 read-through (W6); deletion page | website | Emulator-backed: the website shows the totals the app banked; 404/401/503 states have browser tests | Backend answer on `X-Client-Version` |
| **P3 Content on the backend** | Backend releases, edit-in-place and preparation evidence; website backend adapter (W7) and D1 migration (W8); server Trip; manifest route | all | A release uploads once, activates atomically, rolls back only with rights re-checked; a Trip records its release; the app plays the live deck; Military stays refused while Trainee is short | Backend 5.0 review; release endpoints; Clipper mapping (Military) |
| **P4 Hosting** | Host + managed Postgres, `GAME_API_BASE_URL` on the Worker, shared rate-limit store, backups | backend, website | Hosted smoke run: app and website resolve the same principal and progress | Host choice sign-off |
| **P5 Adapters on demand** | Turn on a UGS service when its trigger fires | Unity, backend | Adapter off = identical behaviour; nothing UGS-held is read for rewards | Per-service decision |

P1 and P2 run in parallel. P3 can start on the backend before hosting, using Aircraft Identifier or a
synthetic roster, because Military cannot release yet.

## 7. Open questions

- **User:** should the website's restore re-check rights now, as the backend's rollback will?
- **User:** when `GAME_API_BASE_URL` is unset, show "Not connected" or a labelled sample?
- **User:** `/play` shows name tag, games played, best streak and recent games, which the backend does
  not provide. Drop them or mark them "coming soon"?
- **User:** rank display names across modules: the Military names (Trainee … Chief Pilot) for the
  backend's enum ids?
- **User:** the progress DTO generated from `openapi.yaml`, or hand-typed with a fixture and a parity
  test?
- **User:** once the backend adapter is on, must the website allowlist and `GET /v1/admin/me` both
  agree that someone is staff? And who switches a desk to the backend adapter, and when?
- **User:** Bunny exposure for game media (a public pull zone over content-addressed images only, or
  signed URLs).
- **Backend session:** where Military preparation evidence lives (content item, separate record, or
  dropped); release candidate, activate and rollback endpoints; the `X-Client-Version` gate for web
  callers.
- **Josh:** four or more Trainee questions; whether Military deals from every rank (C13); the Military
  Clipper Card mapping; the hinted-streak ruling; Flight Segment set bonuses.
- **Open, unchanged:** Callsign/game identity (Phase 7); retention of website rows on account
  deletion; Sign in with Apple before an iOS public launch.

## 8. Not in this plan

Browser gameplay, purchases, or anything sold on the website · UGS Economy, Cloud Code in the
purchase path, or progress written to Cloud Save by the game · a website copy of progress · a website
Callsign registry · merging accounts by email · content written by us (questions, answers, awards and
families come from the client's sheets only).
