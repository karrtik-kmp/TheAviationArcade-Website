# Backend media on the website (wave M)

Status: plan reviewed (senior-lead, backend-expert, frontend-expert: approve with changes, all folded in below).
Contract: `contracts/openapi.yaml` (Backend API 0.17.0, `168897f`). Base: roles wave committed (`1b3cd8e`…`608a6a9`).

## Decisions (user, 2026-11-04)

1. Backend media runs **only with `ROLES_SOURCE=backend`**. With `ROLES_SOURCE=mock` nothing changes.
2. **D-2 amended (PROJECT_STATE 11-04): photographer submissions are stored in the backend and Bunny, not the
   website database, in every mode.** The website's D1 member submission routes answer 404 `SUBMISSIONS_CLOSED` in
   mock and backend mode; on the deployed dev site (mock roles) `/contribute` says submissions open once the photo
   service is connected. Admins can still read existing D1 proposals until they are **migrated to backend media**
   (needs a backend import path that keeps the original owner; raised with backend-9a). The Aircraft Identifier and
   Plane of the Day desks lose their "from a submission" source until content linking (C1).
3. **Rights statement**: wording below approved by the user on 2026-11-04.
   Recorded as the audit `note` on the photo's first licence save until the backend has a field (raised with
   backend-9a, user to rule).
4. **Licence name is free text** (1–200), hinted as the photographer's usage offer.

### Rights statement v1 (approved 2026-11-04; kept in `lib/media-form.ts` as one constant)

- Radio, required — "Who holds the rights to this photo?"
  - "I took this photo and hold the rights to it."
  - "I'm authorised by the person or organisation that holds the rights."
- Checkbox, required — "I confirm this is true, and I agree that Airplane Games may publish this photo, after review,
  under the licence and credit I give for it."
- Audit note sent with the first licence save: `Rights statement v1: own work` or
  `Rights statement v1: authorised by the rights holder`.

### Later rulings (user, 2026-11-04)

- **Guests may see published images** on the public website. The backend adds an anonymous, published-only read
  (backend-9a's recommendation: no website secret, per-IP limits); the website builds public display against it
  once that contract ships.
- **The backend gets real fields for the photo description and the rights statement.** Until they ship, the rights
  statement stays in the audit note; afterwards the website sends both fields and the media import fills them.

## Contract facts the build relies on

- Photographer/staff routes need an active `photographer` or `admin` role and a verified email. Upload
  `POST /v1/admin/media`: raw JPEG/PNG, at most **5,242,880 bytes**, at most 4096 px a side, `Idempotency-Key`
  (`^[A-Za-z0-9_-]{1,128}$`) required; 201 created, 200 replay. New version `POST .../versions?revision=`: same body
  rules, starts with an EMPTY licence. List `GET /v1/admin/media` (`state?`, `cursor?` ≤ 100, `limit`), detail
  `GET /v1/admin/media/{id}` (versions oldest first + signed draft `preview`), licence edit
  `PATCH /v1/admin/media/{id}` `{revision, licence (≥1 key; absent keeps, null clears), note?}`.
- Admin only: `publish` / `withdraw` with `{revision}` only (no note). Publish needs `licenceName`, and `credit` when
  `creditRequired` (422 `content_invalid`); 409 `nothing_to_publish` or `version_conflict`.
- `ImageRef`: `url` (https) + `expiresAt` set, or both null with `reason: cdn_not_configured` (local and dev today).
- `creditRequired` is staff-only: since 0.17.0 the backend answers 403 `forbidden` when a non-admin's PATCH would change
  it (sending the stored value back is a no-op). The website refuses it from non-staff too and never offers the toggle
  to photographers.
- 0.17.0 `GET /v1/admin/media?pending=true` (only the literal `true`; optional `state=published`, any other state is
  400; the cursor is bound to the filter) lists published items whose draft is ahead. Photographers see their own.

## Out of scope

- Public pages: `GET /v1/media` needs a signed-in caller; guest display waits on a user/client licence ruling.
- Linking images to content items (waits for C1). Retiring D1 data. A page CSP (none exists; T10 adds the CDN host
  if one is introduced). A photo description field (raised with backend-9a; user to rule).

## Slices

| Slice | Owner | Files | Depends on |
|---|---|---|---|
| M0 shared | implementer A | `lib/request/media.ts` (server: zod schemas, types), `lib/media-form.ts` (browser-safe: limits, precheck, keys, licence validate/diff, publish blockers, outcome mapping, rights text), `tests/media-form.test.mjs`, contract test in `tests/media.test.mjs` | — |
| M1 server | implementer A | `lib/request/media-routes.ts`, `lib/request/backend.ts` (typed `send` options + status), `lib/request/routes.ts` (spread routes; D1 member routes closed in backend mode), `lib/errors.ts` (optional `retryAfter`), `tests/media.test.mjs`, `tests/backend-client.test.mjs` | M0 |
| M2+M3 UI | implementer B | `components/MediaContribute.tsx`, `components/MediaDesk.tsx`, `app/contribute/(area)/page.tsx`, `components/AdminApp.tsx` (Section union, nav, readOnly exclusion, render line only), `components/contribute.css`, `components/admin.css` (append) | M0 (types/helpers), M1 API table below |

M1 and M2+M3 run in parallel once M0 lands. The lead owns docs (TASKS, SECURITY_REVIEW, PROTOTYPE_SCOPE,
BACKEND_SYNC_PLAN, README) and the final integration.

## Website API (fixed)

All media routes use audience `member` with `mutation: true` on writes, then in the handler, in this order:
mock gate → 404 `MEDIA_UNAVAILABLE`; `ROLES_SOURCE=backend` without a backend → 503 `BACKEND_NOT_CONNECTED`; roles
unreadable → 503 `ROLES_UNAVAILABLE`; not photographer/staff (or not staff for publish/withdraw) → 403
`PHOTOGRAPHER_REQUIRED` / `FORBIDDEN`. Router order still applies first (401 guest, 403 `DEMO_ACCOUNT`, 409
`ACCOUNT_CHANGED`, origin check).

| Method | Path | Who | Request | Backend |
|---|---|---|---|---|
| GET | `media?state=&pending=&cursor=` | photographer/staff | `state` enum or absent; `pending` only `true` (then `state` absent or `published`, else 400); cursor 1–100, no control chars; website sets `limit=50` | `GET /v1/admin/media` |
| POST | `media` | photographer/staff | raw body; `Content-Type` image/jpeg or image/png (params stripped); `Idempotency-Key` | `POST /v1/admin/media` (timeout 30 s) |
| GET | `media/:id` | photographer/staff | `:id` `^med-[1-9][0-9]{0,14}$` else 404 | `GET /v1/admin/media/{id}` |
| PATCH | `media/:id` | photographer/staff | JSON ≤ 16 KB `{revision, licence, note?}`; `creditRequired` staff only (403 `CREDIT_POLICY_STAFF_ONLY`) | `PATCH /v1/admin/media/{id}` |
| POST | `media/:id/versions?revision=` | photographer/staff | raw body + key; `revision` `^[1-9][0-9]{0,9}$` ≤ 2147483647, not repeated | `POST .../versions` (30 s) |
| POST | `media/:id/publish` | staff | JSON `{revision}` only | `POST .../publish` |
| POST | `media/:id/withdraw` | staff | JSON `{revision}` only | `POST .../withdraw` |

Upload handling: refuse a `Content-Length` over 5,242,880 → 413; read `request.body` with a counted reader, cancel at
5,242,881 → 413; empty → 400; forward a `Uint8Array` with the canonical type. Checks before reading the body: gate,
role, key, type, declared length. Upload answers keep the backend status (201 created, 200 replay).

Error codes (backend → website): 400 → `INVALID_REQUEST`; 401 → `SIGNED_OUT`; 403 → `PHOTOGRAPHER_REQUIRED` (photographer
routes) / `FORBIDDEN` (publish, withdraw); 404 → `NOT_FOUND`; 409 `nothing_to_publish` → `NOTHING_TO_PUBLISH`, other
409 → `VERSION_CONFLICT`; 413 → `TOO_LARGE`; 415 → `UNSUPPORTED_TYPE`; 422 `media_invalid` → `MEDIA_INVALID`,
`idempotency_key_reused` → `IDEMPOTENCY_KEY_REUSED`, `content_invalid` → `LICENCE_INCOMPLETE`, other 422 → 502
`BACKEND_CONTRACT`; 429 → `RATE_LIMITED` + `Retry-After`; 503 `storage_unavailable` → `STORAGE_UNAVAILABLE`
(+ `Retry-After` when present); other 503/5xx/426/unreachable → `BACKEND_UNAVAILABLE`; not connected →
`BACKEND_NOT_CONNECTED`; answer off contract → 502 `BACKEND_CONTRACT`. Never retried. Zod issues, inputs and URLs are
never logged; URLs are never built from ids, digests or hosts.

Schemas: `ImageRef` as a plain union of two strict branches (https `url` + datetime `expiresAt` + `reason: null`, or
nulls + `reason: "cdn_not_configured"`); `MediaLicence` URLs `^https?://` ≤ 2048, credit/licenceName 1–200,
attribution ≤ 1000; `MediaItem.owner` optional (admin callers only); ids, sha256, content type, dimension and size
limits checked. Contract test asserts required keys, both `ImageRef` branches, `owner` not required.

## UI behaviour (M2 photographer, M3 admin)

Shared (`lib/media-form.ts`): `MEDIA_MAX_BYTES = 5242880`, `MEDIA_MAX_SIDE = 4096`; `precheckImage(file)` reads the
magic bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`) and sets the type from them, checks size and, where
`createImageBitmap` exists, sides; no minimum size. `mintKey()` = `crypto.randomUUID()`; one key per (file, target)
where target is create or version-of-id; new key when either changes or after success or `IDEMPOTENCY_KEY_REUSED`;
same key on retry after network failure, 503, 429 or 409. `licenceErrors` mirrors the contract (single-line, no
control characters including newlines; trimmed). `licenceDiff(base, values)`: unchanged omitted, cleared → null,
nothing changed → "No changes to save". `publishBlockers(savedLicence)`. `mediaOutcome(status, code)` → ok, retryable,
fileRejected, keyReused, conflict, roleLost, fenced.

M2 `/contribute` (backend mode, `deploymentRolesSource() === "backend" && viewer.photographer`; mock path untouched):
- Account fence copied from SubmissionForm (`sessionMatches`, blocked handling, `accountHeaders` on every call).
- Upload panel: rights statement (required) → native labelled file input → local preview "Your chosen file" →
  Upload with XHR progress (`<progress>`; announce "Uploading…" then "Checking the photo…"). Double-submit guard.
  Outcomes per `mediaOutcome`; file-level errors on the file control with focus.
- After success: open the new item's details, focus its heading, fill-in prompt for the licence.
- Your photos: text-only list (id, state text, "v3 · 2400×1600 · 3.1 MB", licence status, updated date after mount),
  "changes waiting" badge when `draftVersion !== publishedVersion` on published items, Show more by cursor; 400 on a
  stale cursor reloads.
- Details: preview (`<img referrerPolicy="no-referrer">` with width/height, alt "Draft version N of med-X";
  `cdn_not_configured` placeholder "Preview isn't available on this server. The photo was received and checked.";
  `onError` → "The preview link has expired. Reload this photo."), licence form (single-line fields; credit and
  licence name marked "Needed before publishing"; creditRequired shown read-only), versions summary, "Add a new
  version" (new version prefills the previous licence as unsaved values with a note). 409 keeps typed values, reloads,
  re-diffs. Published items: "Changes go live after the team reviews them."
- Copy: no play, no purchase; the licence name is described as the offer under which the photo may be published.

M3 Admin "Media" section (`manageRoles` only; added to the readOnly exclusion and the `Section` union):
- Props `{sessionKey, onBlocked}`; generation guard per item for writes.
- Views (aria-pressed): Unverified, Changes waiting (`pending=true`), Published, Withdrawn, All; "changes waiting"
  badge on rows where `draftVersion !== publishedVersion`.
- Stacked table on phones (copy `.users-table` under `.media-desk-table`). "Uploaded by" shows the account id only.
- Detail: preview (admin also sees "(CDN not configured)"), versions table (live vs draft marked; sha256 shortened
  with the full value selectable), Fluent licence fields including a `creditRequired` checkbox and an optional audit
  note.
- Publish: blocked while the licence form has unsaved edits (inline message); blockers from the SAVED draft shown as
  text with links to the fields; hidden when draft = published. Confirm copy: "Publish version N of med-X? Its licence
  ('…') and credit ('…' / no credit required) are frozen with this version. Nothing appears in a game until the image is
  linked to content, which isn't done here." Without a preview URL add: "This image can't be previewed on this server,
  so you haven't seen it." Withdraw (published only): "Withdraw med-X? The game and the website stop receiving it. Its
  history is kept and it can be published again." No note field on either. Reload and focus the notice after.

Accessibility and layout: one persistent `role="status"` region; errors `role="alert"` with focus; focus to headings on
open, back to the opener on Back/Cancel/Escape; reduced-motion guard on any spinner; no sideways page scroll at 360 px;
full-width buttons under 380 px; tokens in both themes.

## Tests

- `tests/media-form.test.mjs`: size boundary (5,242,880 ok, +1 refused), magic bytes with empty `file.type`, licence
  validation incl. `\n`, diff semantics, key lifecycle, outcome mapping.
- `tests/media.test.mjs`: every route's gate order (mock 404 with no backend call, demo 403, fence 409, non-photographer
  403, roles unavailable 503); id/revision/state/cursor validation with no backend call; key forwarded only when valid;
  body 5,242,880 ok / 5,242,881 413 / lying Content-Length; `image/gif` 415, `image/png; x=y` → `image/png`; 200/201
  passed through; every error code row; 429 keeps Retry-After; photographer `creditRequired` refused; https-only
  `ImageRef.url`, `javascript:` → 502; D1 member routes 404 in backend mode, unchanged in mock; contract test.
- `tests/backend-client.test.mjs`: `Idempotency-Key` only when given and valid; raw body not JSON-stringified;
  per-call timeout; status returned.
- Browser (lead, after integration): mock-mode regression of the D1 form; backend mode against a local Backend
  (upload by keyboard, licence save, 6 MB refused before upload, `cdn_not_configured` text, publish blocked by unsaved
  edits, demo admin has no Media nav, 360 px no sideways scroll in both themes).

## Verification

`npm run typecheck`, `npm test`, `npm run build`; then the browser checks above, recorded honestly.
