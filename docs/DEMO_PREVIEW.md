# Demo account

The shared demo account signs in at `/admin/sign-in` with the existing Firebase email/password flow and lands on a
view-only `/admin`. It shows only the earlier admin **Load demo data** sample drafts, defined once
in `lib/demo-samples.ts`:

- Aircraft Identifier: "Identify this aircraft [Demo]" (Boeing 767-200)
- Plane of the Day: "Threshold Geometry [Demo]" (Boeing 757)

Both are nonpublishable drafts with no source submission. The view has Overview and the two
content desks. Submissions and Activity are hidden; the photographer submission workflow is
out of scope for the demo. Fields are disabled and there are no save, load, schedule, publish
or archive controls. The page renders the bundled samples and never calls an admin API.
`/contribute` sends the demo account to `/admin`.
Photographer and player sign-in pages do not advertise demo credentials. Legacy
`/sign-in?return_to=%2Fadmin` still forwards to the admin sign-in page.

The earlier `/demo` workspace (browser-saved settings, the imported game snapshot and the
sample review states) was removed on 2026-10-23 at the user's request. Demo edits and
settings are not allowed.

## Server boundary

`DEMO_ACCOUNT_UID` identifies the demo principal by Firebase project and UID. Every product
API that requires identity returns 403 for it, including the admin, contributor and Load demo
data routes. It is never staff, even if its email is later added to `STAFF_EMAILS`.

- DEMO_ACCOUNT_UID: the actual Firebase UID; it removes live data capabilities server-side.
- DEMO_LOGIN_EMAIL / DEMO_LOGIN_PASSWORD: intentionally shared sample credentials exposed by
  `/api/auth/config` so the sign-in form can prefill them. Never use a private or staff password.

These bindings are optional and default off. The credential values belong in ignored local
settings and encrypted Worker bindings, not in source control. To stop advertising the login,
remove the email/password bindings and keep DEMO_ACCOUNT_UID, which keeps the account blocked.
The hosted account `demo@airplane-games.test` in `airplane-games-auth-20261022` has no staff
access, and its email verification was not overridden.

## Local verification

Run `npm run auth:emulator`, then `npm run demo:preview` in a separate terminal. The preview
runs at http://127.0.0.1:5186 with ignored `.dev.vars.demo-preview` and the local account
`demo-pilot@sites.test` / `LocalPreview-2026!`. Then run `node scripts/demo-admin-qa.mjs`
with QA_ORIGIN set to that origin and PLAYWRIGHT_MODULE pointing to an installed module.

`SITE_BASE_PATH` can be set before starting the preview. For example, `/play` puts
admin sign-in at `/play/admin/sign-in`. Use `scripts/role-auth-qa.mjs` with the matching
`QA_ORIGIN` and `QA_BASE_PATH` to verify prefixed role flows; see README.md. The player
screen is a sample only: app profile linking is coming soon, with no real linked state.

Evidence: `docs/evidence/demo-admin/`. Six local checks pass: `/demo` returns 404; prefilled
login opens the view-only admin with only Overview and the two desks; both sample drafts open
with disabled fields, no mutation controls and no API writes; five live API probes return 403
and `/contribute` returns to `/admin`; all desks have no horizontal overflow at
320/390/768/1440px in both themes; sign-out returns anonymous 401. No page errors.

The hosted preview still runs the earlier `/demo` build (`feb4cba`) until it is redeployed.
Evidence for that build remains under `docs/evidence/*demo-workspace/` as history.
