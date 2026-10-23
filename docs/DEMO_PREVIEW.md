# Demo workspace

The demo uses the existing Firebase email/password flow and a separate `/demo` workspace.
Settings and editorial examples are saved only in the current browser, under its account
session key. Reset restores the imported game defaults. No demo edit writes to D1, photo
storage, the mobile game, or the public website. Shared demo users are denied live editorial
and contributor APIs on the server, including if someone later adds their email to STAFF_EMAILS.

The screen uses the existing website tokens, typography and native form controls. Its job is
to inspect game defaults and edit sample preferences/content. The main action is Save demo
changes; Reset demo is secondary. Desktop uses a side navigation and a content column;
phones stack navigation above content. Loading, expired/account-changed, storage-error,
save-success and empty-filter states must be explicit. Existing site CSS is the design reference.

## Data and behavior

`npm run demo:import -- C:/Unity/Projects/AviationArcade_v2` refreshes the committed metadata
snapshot from the game. It records source paths and SHA-256 hashes. It does not copy photos,
grant publishing rights, change the game catalog, or infer aircraft facts from website images.
The approved Commercial/Military split appears in this reference even while the public website
catalog awaits its own update. Military remains Coming Soon.

Defaults come from PlayerPrefsSettingsRepository, FeedbackCues, ThemeManager, HintBank,
FlightRankThresholds and InProcessMockBackend. A fresh player starts at zero Miles and
Status Points, has no Callsign, and receives five starter hints. Daily resets follow the
player's local calendar day. Monetization stays off. The untimed setting is a demo inspection
control; the game does not currently expose a Settings row for it.

Submissions are illustrative records built around imported metadata. A sample approval
changes only its local review state; it does not establish usage rights or publish content.
POTD edits operate on a browser copy of the selected imported record. Support, reporting,
staff roles, account linking and release settings are shown with their real implementation
status rather than simulated as working production services.

## Account configuration

Local verification uses `npm run auth:emulator`, then `npm run demo:preview` in a separate terminal.
The preview runs at http://127.0.0.1:5186 and uses ignored `.dev.vars.demo-preview` with
`CLOUDFLARE_ENV=demo-preview`. Its local sample account is `demo-pilot@sites.test` with the
existing emulator-only password `LocalPreview-2026!`. The profile captures that account's actual
UID and applies the same server restrictions as the hosted configuration. It does not read or
modify hosted Firebase accounts or the regular `.dev.vars` settings.

Run `node scripts/demo-workspace-qa.mjs` with QA_ORIGIN set to that local origin and
PLAYWRIGHT_MODULE pointing to an installed module. Evidence is in `docs/evidence/demo-workspace/`.
All 36 unit tests, TypeScript and focused lint pass. Eight browser checks cover credential
prefill/sign-in, live API denial, persistence/reset, source data/filtering, draft review, both
themes at 320/390/768/1440px, and distinct-account isolation. No page errors were observed.
Desktop/mobile screenshots were visually reviewed. Production build passes; a pre-existing
AccountPage set-state-in-effect lint error and existing AuthForm navigation warning remain
outside the new demo implementation's focused lint result.

The hosted demo account has not been provisioned. Automatic approval review rejected creating
a persistent Firebase account with public sample credentials. Explicit approval is required
before provisioning it, configuring the following bindings, and publishing the reviewed source.

- DEMO_ACCOUNT_UID: the actual Firebase UID; it removes live data capabilities server-side.
- DEMO_LOGIN_EMAIL / DEMO_LOGIN_PASSWORD: intentionally shared sample credentials exposed by
  `/api/auth/config` so the sign-in form can prefill them. Never use a private or staff password.

These bindings are optional and default off. Firebase tokens, HttpOnly session cookies, Google
login and server staff allowlisting remain the existing authentication path. The production
demo account must never be a staff member. The credential values belong in ignored local
settings and encrypted Worker bindings, not in source control. The browser workspace is also
available to ordinary authenticated users for inspection.

To stop advertising the login, remove its email/password bindings while retaining
DEMO_ACCOUNT_UID. Retaining the UID keeps the account blocked from live data APIs.
