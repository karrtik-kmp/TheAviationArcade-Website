# Brief to the backend: content endpoints the website needs to leave D1

**From:** website session · **Written:** 2026-11-05 · **Ruling:** user, 2026-11-05
(`../../../docs/briefs/website-admin-hosting.md`, revised: the website and the Admin both leave Cloudflare
for our Hostinger server, as `dev.playairplanegames.com` and `dev.admin.playairplanegames.com` first).

The server has no D1. Every website read and write that still uses D1 has to go through the backend
before the cut-over (C1, D-2). User priority 2026-11-05: **dev sites only for now**, so the dev backend
(`dev.api.playairplanegames.com`, loopback port 3001) is the first target. How you build it is yours: plan it
through your own gate and reply with the contract (`docs/openapi.yaml` version) so the website can vendor it.

## What the backend already has (checked in code 2026-11-05, no change asked)

- `PATCH /v1/admin/content/:module/items/:id` with `version` compare-and-set, 409 `version_conflict`, one
  `admin_audit` row per change; `PUT .../items/:id/media` with `expectedVersion`; retire/restore; imports;
  export. Modules: `military`, `airport-spotter` only. (`ARCHITECTURE.md:233` still says edit-in-place is not
  built; it is, per TASKS 5.M.)
- Media (photographer uploads, rights, publish/withdraw) and the guest read `GET /v1/public/media?ids=`.

## Gaps, by website desk

Shapes below are what the website desks use today (website `lib/editorial/store.ts`, `content.ts`,
`lib/request/routes.ts`). They describe the need, not your wire format.

### 1. Military desk (website `EditorialStore`)
- **Preparation stage and evidence per item** (`missing_photo` … `approved`) with compare-and-set and one audit
  row per change. Today's `PATCH` edits only the sheet payload.
- **Rights guard:** at stage 1 or higher the linked media must be approved for game use and not demo.
- **List read** returning the items plus the live pointer `{ current, history, version }` and the recent
  releases with `status` (`uploaded` | `released`).
- **Releases** (your 5.Q, designed, not built): upload a candidate (`basis`, `previewed`) → immutable,
  listed, not live; activate (`release`, `pointerVersion`) only if no package version and no linked media
  version/digest changed since upload; restore (`pointerVersion`). One audit row per step. Refusals return their
  reasons (the desk shows them).

### 2. Aircraft Identifier desk (website `ContentStore`, kind `identifier`)
No backend module. Needed: a module with list, create draft (from an approved media item), and save with base
version + status + data (`title, aircraft, photographer, credit, description, correctAnswer, difficulty,
factualSource, imageUrl`, exactly 3 `distractors`). Publishing keeps the website rule: approval plus applicable
usage offers; demo content never publishable.

### 3. Plane of the Day (desk + public site)
- Admin: a module with the same list/create/save as §2, plus a schedule date (`dateKey`) and status.
- **Public read (new need from the revision):** the public site's `GET /api/featured` and `/api/photos/:id` show
  today's Plane of the Day and its archive: published/scheduled items due on or before the viewer's local day,
  newest first, each with credit and an approved photo. Needs an unauthenticated read (by date, with image
  delivery like `GET /v1/public/media`), or tell us to fold it into the content manifest.

### 4. Admin audit desk
`GET /v1/admin/audit`, staff only: the latest 50 rows (entity, action, detail, actor, createdAt). Pending a
user decision on whether the desk stays; build it only if they confirm.

### 5. Migration (website W8)
Military, Aircraft Identifier and Plane of the Day records reference **D1 submission ids**. After the D1 proposals
are imported as media (`npm run media:export` → your media import), the website needs the D1-id → media-id map
from `media_imports`: either a staff read of it, or the import applies it. Say which.

## Not asked
- No backend copy of the website's demo sample loader (`admin/demo`); it retires.
- No D1-over-HTTP or any Cloudflare dependency on the server.

## Order that unblocks the dev sites soonest
§3 public read and §2/§3 modules (the public site's only D1 reads), then §5, then §1, then §4 if confirmed.
