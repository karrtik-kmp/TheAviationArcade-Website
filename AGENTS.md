# Airplane Games website guide

Sole website/admin source: `H:/Work/TheAviationArcade/website`. Start with README.md and
docs/TASKS.md, then inspect actual Git status. Unity is a reference source for this work.

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
- Cloud project is `airplane-games-auth-20261022`. Local tests use `demo-airplane-games` only.
  Never expose CLI credentials, ID/refresh tokens, service-account keys or .dev.vars in commits.
- Server principal is namespaced by Firebase project and UID. Never reassign existing content
  ownership by matching an editable contact email, photographer credit or provider display name.
- Roles come from the game backend (Backend ADR-0002) with `ROLES_SOURCE=backend`: staff = an
  active `admin` row, photographer = an active `photographer` row, each with a verified email and
  never the demo account, read per request with the member's own token. Until the backend is
  hosted, `ROLES_SOURCE=mock` (default) reads `MOCK_ADMIN_EMAILS`/`MOCK_PHOTOGRAPHER_EMAILS` and
  hides role requests and the Users section. `STAFF_EMAILS` is retired. Unreadable roles fail
  closed. No client-selected role can grant privileges.
- Callsign is the community player name tag. It is not a credential. Do not build a competing
  website name registry or silently amend the frozen game account contract.
- Keep session request generations, account-change fences and captured draft base versions.
  Revalidation may retain unsaved drafts, but must not overwrite another editor's version.
- Publishing requires approval and applicable usage offers; demo content is nonpublishable.
- Preserve current Site identity and audience. Native Site source/version/deploy workflow applies
  to runtime changes; do not create another Site or attach the product domain without scope.
- The site runs as a Node server (`npm run build:node`, `dist-node/server.mjs`), not Cloudflare Workers.
  Server settings come from the process environment through `lib/settings.ts` only (`web.env.example`).
  `SITE_SURFACE` (public | admin) is routing, never authorization. There is no D1: its routes answer 503.

Use Luna for predefined implementation jobs and 6.1 Sol low/medium for complex planning/review.
Give workers separate file ownership. Review their integration, record actual verification and
commit focused checkpoints. Do not rewrite existing published history to tidy commit messages.
