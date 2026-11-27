# Plan: Firebase session cookies for website sign-in

**Status:** revised after the review gate and decided by the user, 2026-11-27. Not started. All four reviewers (senior-lead, backend-expert,
frontend-expert, devops-expert) returned **approve with changes**; their required changes are folded in below.
Open user decisions are listed at the end; the defaults here are the reviewers' recommendations.
Backend part: `../../docs/briefs/backend-session-cookie-credential.md` (sent 2026-11-27).
**Why:** the user asked (2026-11-27) to move sign-in to the standard, well-tried Firebase setup.

## Today

1. The Firebase client SDK signs in (email/password, Google popup, Apple popup) and keeps the user in IndexedDB.
2. `lib/firebase-client.ts` posts the raw **ID token** to `POST /api/auth/session`.
3. The route verifies it with `jose` (`lib/firebase-verifier.ts`) and stores **that ID token** as `__Host-aa_session`,
   `Max-Age` ≤ the token's remaining life (≤ 1 h).
4. `lib/request/principal.ts` verifies the cookie on every request, reads roles from the Backend with it, and
   forwards it as `Authorization: Bearer` (roles, progress, photographer self-serve, media).
5. `components/AccountSession.tsx` re-mirrors the cookie from IndexedDB on tab return (`onIdTokenChanged`, locks,
   generation tickets), so an expired cookie mostly heals itself once a page's JavaScript runs.

What that leaves: the first server render after an hour away shows a guest (flash, then correction); two stores
(IndexedDB and the cookie) that the client must reconcile; **no revocation** — a disabled or password-reset account
keeps access until its token expires. The real gains of this change are revocation and one source of truth; it is
not urgent.

## Target

Sources (read 2026-11-27): [Manage Session Cookies](https://firebase.google.com/docs/auth/admin/manage-cookies),
[Auth emulator](https://firebase.google.com/docs/emulator-suite/connect_auth),
[redirect best practices](https://firebase.google.com/docs/auth/web/redirect-best-practices),
firebase-admin 14.5.1 source (`token-verifier.js`, `base-auth.js`, `jwt.js`).

1. **Client:** `initializeAuth(app, { persistence: inMemoryPersistence, popupRedirectResolver:
   browserPopupRedirectResolver })`, created only in `getFirebaseClient` (no `getAuth` anywhere: it throws
   `auth/already-initialized` otherwise). Popups keep working; redirects stay unused.
2. **Exchange:** post `credential.user.getIdToken()` from *that* sign-in call (never `auth.currentUser`) to
   `POST /api/auth/session`; then `signOut(auth)`.
3. **Server:** verify the ID token → claim rules (provider ∈ {password, google.com, apple.com}, email shape, demo
   rules) → `getUser` (not disabled, `auth_time` ≥ `tokensValidAfterTime`) → `auth_time` within **300 s** →
   `createSessionCookie(idToken, { expiresIn: 5 days })`.
4. **Cookie:** `__Host-aa_session; HttpOnly; Secure; SameSite=Lax; Path=/`, `Max-Age` from the new cookie's decoded
   `exp`. Refuse (500 + log) if the `Set-Cookie` line would exceed 4000 bytes.
5. **Every request:** verify the session cookie **with `jose`** — issuer `https://session.firebase.google.com/<pid>`,
   audience `<pid>`, RS256 only, keys from `https://www.googleapis.com/identitytoolkit/v3/relyingparty/publicKeys`
   (kid → X.509 PEM map, `max-age=86400`, loaded with `importX509`), wrapped in fail-closed key handling. The same
   design as the Backend's verifier. firebase-admin is used **only** for `createSessionCookie` and `getUser`, because
   its `verifySessionCookie` reports "Google unreachable" with the same `auth/argument-error` as a forged cookie.
6. **Backend** gets the session cookie as the bearer and is the revocation authority (D3).
7. **Sign-out:** clear the cookie; `signOut(auth)` if loaded. No `revokeRefreshTokens` (D5).

## Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Session length | **5 days** (allowed 5 min – 2 weeks); the cookie's `exp − iat` must be ≤ 14 days | Survives a closed browser; revocation (D3) covers disabled accounts sooner |
| D2 | What the Backend gets | The session cookie as `Authorization: Bearer`, **accepted only on the website's routes** (allowlist in the brief) and only for providers password / google.com / apple.com — no guest or linked-anonymous path | Website has no ID token after the exchange. Rejected: a server-held refresh token (never-expiring, could mint game tokens); a website-asserted uid (breaks ADR-0002) |
| D3 | Revocation | **Backend checks on every session-cookie request** (`getUser`, per-uid "not revoked" cache ≤ 60 s; a disabled/revoked answer is never cached as OK). Website uses plain `jose` verify for page renders and relies on the Backend's roles answer; it calls `getUser` itself only in `POST /api/auth/session`, `/api/account` and website-local mutations that don't reach the Backend. **Unreachable Google, quota error or missing key → 503 with `Retry-After`, cookie kept, never "not revoked", never guest.** Definitively invalid → guest and the cookie is cleared. A **Backend 401** on a member's bearer → guest (401 on API routes) + cookie cleared, not `ROLES_UNAVAILABLE`. Every Admin call has an explicit timeout (4 s, like roles) | One Google call per request at most, fails closed ("Unreadable roles fail closed") |
| D4 | Credentials | Dedicated service account `website-session` in `airplane-games-9fe1e` with a **custom role** holding only `firebaseauth.users.createSession` + `firebaseauth.users.get` (S0 checks the permission is allowed in custom roles; if not, `roles/firebaseauth.admin` as a risk the user signs off). Setting `FIREBASE_ADMIN_SERVICE_ACCOUNT_FILE` read through `lib/settings.ts`, loaded with `cert()`; **never** `applicationDefault()` / `GOOGLE_APPLICATION_CREDENTIALS`. Refuse to start in a production build if the file is missing, not `type: service_account`, or its `project_id` ≠ `FIREBASE_PROJECT_ID`. Log `client_email` + `private_key_id`, never the key. Initialize lazily (the build runs with the env file loaded). Installed with the server convention `install -o root -g aviation -m 0640 … /var/www/<domain>/envVar/firebase-web-session.json`. **Dev key only** for now; live key at the live flip. Key file chosen; inline env JSON rejected (exposed at build, multi-line); Workload Identity rejected (no identity provider on Hostinger). Accepted limit: every app runs as the one `aviation` user, so separate keys give rotation and audit, not isolation | Least privilege; matches `server/README.md` and the Backend's `FIREBASE_ADMIN_SERVICE_ACCOUNT_FILE` |
| D5 | Sign-out | Clear the cookie only. "Sign out of all devices" is **out of scope** (separate user decision; it would also sign the player out of the game and needs `firebaseauth.users.update`). Accepted risk, recorded in `SECURITY_REVIEW.md`: a copied cookie stays valid until expiry or revocation | The same account signs in to the game |
| D6 | CSRF | `dispatch` calls `sameOrigin` for **every non-GET method**, whatever the route's `mutation` flag (today it is opt-in), plus `SameSite=Lax` and a non-simple content type (JSON, `image/jpeg`, `image/png`). The session POST already rejects a missing Origin | The docs' double-submit token is an example, not a requirement |
| D7 | Emulator | Emulator mode only when **all** hold: development build (`import.meta.env.DEV`, not `NODE_ENV`), `FIREBASE_PROJECT_ID` = `demo-airplane-games`, loopback emulator host (`parseEmulatorUrl`), and no service-account file configured. `lib/settings.ts` stays the source; it sets `FIREBASE_AUTH_EMULATOR_HOST` for the Admin SDK only after those checks. Keep the per-request loopback check from `firebaseSettings` (`vite --host` exposes the LAN). `initializeApp({ projectId, credential })` explicitly. Any other combination refuses at start and at first use; a `demo-` project in a production build refuses too | The Admin SDK accepts unsigned tokens and cookies whenever that variable is set |
| D8 | Email verified after sign-up | **No refresh mode.** `sendEmailVerification` gets `ActionCodeSettings.url` → `/account?verified=1`, which asks the person to sign in again; a fresh sign-in gives a new cookie with `email_verified: true`. Before verifying, the account page shows one "Sign in again to confirm your email" link (no in-memory user survives `navigateTo`'s full page load). Same for an admin marking an email verified: it takes effect at the next sign-in — say so in the copy | `email_verified` is frozen in a cookie; a refresh mode would be exactly the bypass of the 300 s rule |
| D9 | Old cookies at release | Old ID-token cookies fail on the issuer → invalid → guest, **cookie cleared**. One-time `indexedDB.deleteDatabase("firebaseLocalStorageDb")` in `getFirebaseClient`, so no stale refresh token stays on disk. People sign in once | Small audience; no silent-upgrade exception |
| D10 | Rollout switch | Setting `AUTH_SESSION_KIND=id-token\|session-cookie`, default `id-token`. Both paths live until live has run on session cookies for two weeks; the ID-token path is removed in a follow-up | Dev and live deploy the same branch zip; a hotfix must not ship session cookies to live before the prod Backend accepts them |
| D11 | Admin repo | Divergence from the Admin's copied auth code is deliberate and temporary; the Admin keeps ID tokens until S6 | `website/AGENTS.md` copied-module rule |

## What the client keeps and removes (S4)

**Removed:** in `lib/firebase-client.ts` — `mirrored`, the `owner`/`generation` tickets, `serialize` + Web Locks, the
`syncFirebaseSession` background mirror, `getAuth`; in `components/AccountSession.tsx` — `firebaseAuth`,
`confirmedFirebaseUid`, `observedFirebaseUid`, the `onIdTokenChanged` subscription, the "cookie gone, mirror once
more" retry.

**Kept, unchanged:** `AccountSession`'s `serial` / `aborter` / `stale()` request generation; `reportAccess`
(401/403/409); the focus/pageshow/visibility recheck; the `aa-auth-changing` / `changed` / `error` events;
`accountHeaders(sessionKey)` on every mutation and the server's `X-Account-Session` fence (409 `ACCOUNT_CHANGED`);
captured draft base versions; SignOutPage's single-attempt dedupe.

**Changed:**
- The quiet same-user check compares the new `/api/account` `sessionKey` with the one on screen (not a Firebase uid).
  On a mismatch: clear the account, leave quiet mode, show the new account with a normal loading state.
- BroadcastChannel moves to a small module with no Firebase import, owned by AccountSession. It broadcasts
  `signed-in` and `signed-out`; receivers only `signOut` their own in-memory auth (if loaded) and call `refresh()` —
  **they never send a network write** (a receiver's DELETE could clear a newer sign-in's cookie).
- On a failed exchange: `signOut(auth)` (no orphan user), show the server's error. A retry reuses the in-memory user
  only while its uid is unchanged, otherwise asks for a new sign-in.
- New "session ended" state, reusing `AccessGate` / `AccountActions`: "Your session ended. Sign in again to
  continue.", `role="alert"`, focus to the heading (`tabIndex={-1}`), link via `accountSignInPath(currentReturnPath())`,
  `target="_top"`, no auto-redirect, the form's state kept underneath, existing `.btn` styles and tokens.
- Firebase SDK loads only on `AuthForm` and `AccountPage` (lazy import there).
- No COOP header is added (popup close detection); noted in `SECURITY_REVIEW.md`.

## Steps

Rollout order: Backend S1 on dev → website on dev with `AUTH_SESSION_KIND=session-cookie` → S7 evidence on dev →
Backend S1 on prod → live key installed → flip live → live check. **Rollback:** website first (flag back to
`id-token`, or an earlier zip with `web-deploy.sh website --zip …`), then the Backend; never the Backend alone.

| Step | Repo | What | Done when |
|---|---|---|---|
| S0 | user | Service account + custom role (D4), dev key, installed with the `install … 0640` command; `FIREBASE_ADMIN_SERVICE_ACCOUNT_FILE` in the dev env file. Backend credential for `getUser` per the brief | Key loads; logged `private_key_id` matches |
| pre | website | Commit the Apple sign-in change (uncommitted today); `AGENTS.md` + TASKS say email/password, Google and Apple | Committed |
| S1 | Backend | Brief: accept session cookies on the allowlist, revocation authority, fail closed | Release on dev; version reported |
| S2 | website | **Spike first:** `firebase-admin` 14.5.1 pinned exactly, external in the rsc/ssr builds (Vinext bundles everything by default), imported only as `firebase-admin/app` + `/auth` from a server-only `lib/firebase-admin.ts`; confirm the emulator implements `createSessionCookie` with unsigned session-issuer cookies and that `auth_time` behaves as expected. Stop and report if it needs more than marking it external. Then: settings (D4, D7, D10), session-cookie `jose` verifier sharing the claim rules, `.gitignore` for `*-firebase-adminsdk-*.json`, `service-account*.json`, `firebase-admin*.json` | Unit tests: both token kinds; ID-token key on a session cookie refused; key-fetch failure → unavailable; every D7 refusal on its own; D4 start refusals; no client chunk contains firebase-admin |
| S3 | website | Session route (Target 3–4) behind D10; `resolvePrincipal` per D3; Backend 401 → guest + clear; invalid cookie cleared; `sameOrigin` for all non-GET (D6); cookie size check; structured logs (exchange outcome + error code + uid hash, a distinct `PERMISSION_DENIED` log, revocation timings); `/api/health` reports "admin credential loaded" without a network call | Route tests: stale `auth_time` 401; wrong provider; disabled/revoked; `getUser` and `createSessionCookie` network failure → 503 not 401; Backend 401 → guest; route without `mutation` flag still 403 cross-origin; oversize cookie refused |
| S4 | website | Client per the section above; D8 copy and `ActionCodeSettings`; D9 IndexedDB cleanup | `npm run typecheck`, `npm test`, `npm run build`; unit test: changed `sessionKey` in a background refresh is an account change |
| S5 | website | Docs: `FIREBASE_SETUP.md` (service account, role, install, **rotation runbook**: new key → install → `apm2 restart aviation-web-<name>` → check logged `private_key_id` + a sign-in → delete old key in IAM; every 90 days; a leaked key is deleted first), `AUTH_FLOW_REVIEW.md`, `SECURITY_REVIEW.md` (D5 risk, shared Unix user, no COOP), the website's own `web.env.example`, README. **`server/` belongs to the design-docs session:** send it a message to update `server/web.env.example` and `server/README.md` | Docs match the code |
| S6 | Admin | Same change in the Admin repo, its own brief after S3 is reviewed; its own key | Admin ships the same flow |
| S7 | verify | Emulator, local Backend with S1: `npm run test:auth`, `browser-qa.mjs`, `api-qa.mjs`, plus: (a) sign in, reload, still signed in; (b) the D8 flow (update `firebase-auth-qa.mjs` sign-up → verify steps); (c) tab A as X, tab B signs in as Y → A refreshes to Y, a write started in A under X gets 409, no retry; (d) sign-out in B sends exactly one DELETE, A shows signed out; (e) Google popup on the emulator; (f) a disabled account on a write shows the session-ended prompt with focus on its heading; (g) the Admin still works against the S1 Backend with ID tokens. **Dev site:** the user signs in with email, Google and Apple, closes the browser, returns after > 1 h and is still signed in; a disabled **test** account is refused by the Backend and the website. **Live:** after the flip, the user's own sign-in check; live revocation is not exercised unless the user does it | Evidence recorded; live Google/Apple claimed only after the user's check |

## Sequencing against the dev demo

Send the Backend brief now. The website's S3/S4 wait until the A3 dev deploy and Josh's demo sign-off
(`docs/intent/hosting-dev-demo.md`), unless the user says to go sooner. S2's spike can run any time (no behaviour
change).

## User decisions

**2026-11-27: the user accepted every default below** ("Accept defaults"): after the dev demo; the rule narrowed as
in 2; 5-day session; Backend allowlist; sign in again after verifying; one key per site with the shared `aviation`
user accepted as a recorded risk; no "Sign out of all devices" for now. The Backend brief is sent now; S2's spike may
run before the demo, S3/S4 wait for the demo sign-off.

1. **Timing:** after the dev demo (default) or before?
2. **The rule "keep session-generation guards"** (root `CLAUDE.md`, `AGENTS.md`): may it be narrowed to say the
   background cookie-mirroring generations go, while the request serial, the `sessionKey` fence and draft base
   versions stay? The plan needs that narrowing; without it, S4 keeps every counter.
3. **D1:** is a 5-day session acceptable?
4. **D2:** session cookies accepted at the Backend only on the website's routes (default), knowing every new
   website → Backend route must be added to the list?
5. **D8:** sign in again after verifying the email (default), or stay on the sign-in card until verified?
6. **Keys:** one per site (website and Admin separately, default) or one per environment shared by both? Accept that
   all apps share the `aviation` Unix user, or move the server to one user per environment?
7. **D5:** a later "Sign out of all devices" — wanted at all?

The root `CLAUDE.md` and `docs/PROJECT_STATE.md` still say "email/password and Google only"; flag the Apple
amendment to the design-docs session (the root folder is not this repo).
