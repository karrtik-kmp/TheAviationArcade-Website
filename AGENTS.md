# Airplane Games website guide

Public website source: `H:/Work/TheAviationArcade/website`. The Admin (staff desks) is its own repo,
`H:/Work/TheAviationArcade/Admin` (decision I-1, 2026-11-13): no `/admin` pages or admin API here.
Shared modules (auth, session, roles, router) are copied between the two repos; a fix lands in both.
Start with README.md and docs/TASKS.md, then inspect actual Git status. Unity is a reference source.

## Commands

- Install: `npm run install:ci`
- Local auth: `npm run auth:emulator` (terminal 1, demo project, port 9099)
- Local users: `npm run demo:seed`
- Website: `npm run dev` (terminal 2, port 5173)
- Checks: `npm run typecheck`, `npm test`, `npm run build`
- Browser: `npm run test:auth`, `node scripts/browser-qa.mjs`, `node scripts/api-qa.mjs`
  with PLAYWRIGHT_MODULE pointing to an installed module. Both local servers must be running.
- Windows/runtime fallbacks and fresh-database initialization are in README.md.

## Durable boundaries

- Product authentication is Firebase email/password and Google only. Hosting's private review
  gate is separate; hosting headers must not authorize product actions.
- Cloud project is `airplane-games-9fe1e` (ruling 2026-11-16; `airplane-games-auth-20261022` is retired and
  its accounts don't carry over). Local tests use `demo-airplane-games` only.
  Never expose CLI credentials, ID/refresh tokens, service-account keys or .dev.vars in commits.
- Server principal is namespaced by Firebase project and UID. Never reassign existing content
  ownership by matching an editable contact email, photographer credit or provider display name.
- Roles come from the game backend (Backend ADR-0002) with `ROLES_SOURCE=backend`: staff = an
  active `admin` row, photographer = an active `photographer` row, each with a verified email and
  never the demo account, read per request with the member's own token. Until the backend is
  hosted, `ROLES_SOURCE=mock` (default) reads `MOCK_ADMIN_EMAILS`/`MOCK_PHOTOGRAPHER_EMAILS` and
  hides role requests. `STAFF_EMAILS` is retired. Unreadable roles fail
  closed. No client-selected role can grant privileges.
- Callsign is the community player name tag. It is not a credential. Do not build a competing
  website name registry or silently amend the frozen game account contract.
- Keep session request generations, account-change fences and captured draft base versions.
  Revalidation may retain unsaved drafts, but must not overwrite another editor's version.
- Website scope follows the client proposal (`../docs/SRS.md` §5; user ruling 2026-11-26): the "sells nothing"
  and "no how to play" rules are retired. Allowed: First Class Pass information and member pages, subscription
  purchase, an affiliate marketplace, partner directory, ad placements, FAQ with gameplay guides. Still binding:
  no game is played in the browser; every product, partner, price, FAQ answer and guide comes from the client;
  no web checkout until the payment design (SRS OI-21) is decided; open client questions are in
  `docs/feedback/client-questions-srs.md`.
- Publishing is an Admin desk (its own repo). Demo content is nonpublishable; the demo account can't send
  photos here.
- Preserve current Site identity and audience. Native Site source/version/deploy workflow applies
  to runtime changes; do not create another Site or attach the product domain without scope.
- The site runs as a Node server (`npm run build:node`, `dist-node/server.mjs`), not Cloudflare Workers.
  Server settings come from the process environment through `lib/settings.ts` only (`web.env.example`).
  `SITE_SURFACE` may only be `public` (or unset); the server refuses anything else. Staff links go to the
  Admin host derived from this host (`lib/admin-site.ts`). There is no D1: its routes answer 503.

Use Luna for predefined implementation jobs and 6.1 Sol low/medium for complex planning/review.
Give workers separate file ownership. Review their integration, record actual verification and
commit focused checkpoints. Do not rewrite existing published history to tidy commit messages.
