# Website prototype task board

Sole website/admin repository: `H:/Work/TheAviationArcade/website`.
Unity is a read-only reference for approved branding/content. Do not create a website
folder there. Read README.md and actual Git status when resuming.

## Accepted scope and decisions

- Homepage, seven-game catalog, photographer photo proposals, and admin for Aircraft
  Identifier and Plane of the Day, preserving the existing branding.
- Product authentication: Firebase email/password and Google only. The private host
  access gate is separate and must not grant product permissions.
- Callsign is the existing community player name tag. Game-account linkage and an
  authoritative Callsign claim service remain future work; do not create another registry.
- Luna handles scoped implementation; 6.1 Sol low/medium handles complex planning/review.
- Demo content/credentials remain local and nonpublishable. Browser gameplay,
  commerce and game-backend content delivery are outside this slice.

## Jobs

| Job                                              | State                            | Evidence / next action                                                                                          |
| ------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Existing brand, homepage and seven-game catalog  | Complete                         | Original logo/fonts, optimized preview assets, responsive layouts, search/filter/theme                          |
| Photographer proposals                           | Complete for private prototype   | Metadata, rights evidence, proposed channels, private uploads, own list and revisions                           |
| Editorial review and content prototypes          | Complete for private prototype   | Five-check approval, versioned records, audit, separate publish/schedule action and usage checks                |
| Firebase project and providers                   | Complete                         | `airplane-games-auth-20261022`; email/password + Google configured; runtime bindings configured                 |
| Registration, sign-in, reset and verification    | Implemented and locally verified | Firebase browser/emulator suite; live Google consent and email delivery remain a human check                    |
| Account controls and logout                      | Implemented and locally verified | Desktop/mobile menu, account page, safe return path, session-change/denial states                               |
| Admin and photographer isolation                 | Implemented and locally verified | Verified staff allowlist, project/UID ownership, distinct-user list/photo/revision tests, stale-write rejection |
| Focused rules, auth, storage and deploy tests    | Complete                         | 32 unit tests pass; TypeScript and focused deploy-tooling ESLint pass                                            |
| Core browser/API regression                      | Complete                         | Eight workflows, concurrent retry, photo retention and narrow/light layouts pass                                |
| Locked production build                          | Complete                         | Final integrated source builds successfully                                                                     |
| README and repo guidelines                       | Updated                          | Two-terminal setup, demo seeding, local routes, Windows fallback, auth/data boundaries                          |
| Organized source commits and private publication | Complete                         | Focused implementation, verification and documentation commits; successful private deployment recorded below    |
| GitHub synchronization                           | Awaiting approval                | Local commits are complete; push to the configured GitHub remote awaits explicit authorization                  |
| Live Google sign-in / real email delivery        | Human check pending              | Do not equate emulator behavior with live provider completion                                                   |
| Shared app/web principal and Callsign linking    | Open integration                 | Apply original shared-account ruling; resolve applicable ADR-0006 policies and game contract                    |
| Production staff capabilities/MFA                | Open                             | Binary verified-email allowlist is not the complete capability matrix                                           |
| Public-launch media and privacy hardening        | Open                             | Full decode/re-encode, abuse controls, approved rights and retention/deletion workflow                          |
| Mobile loading optimization                      | Follow-up                        | Historical pre-Firebase Lighthouse: performance 82, accessibility 100, best practices 100, LCP 4.1s             |

## Verification contract

README.md contains the supported commands. Run source checks, then browser suites
against local Firebase Auth/D1/R2 emulation. Suites mutate local fixtures and should
run sequentially. Evidence JSON must describe passes, failures and skipped provider
checks honestly. No credentials, session tokens or real private data belong in evidence.
The Google helper script is blocked by the local auth harness; provider authentication
is not established by that case.

Preserve `.dev.vars`, database state and credentials outside Git. Generated dependencies,
runtime caches, builds and publication archives are ignored. Restore only known task-owned
artifacts; do not discard unrelated work. Make focused commits without rewriting published history.

## Publication checkpoint

The Firebase runtime checkpoint is `22d6e332df8e22afd9e074f0ed4bce1f4d6f7b77`.
Deployment `appgdep_6ada24c613d88191a1105d4f8e9df4f0` succeeded on 2026-10-22,
using environment revision 2. This supersedes runtime `ddd569f` and its earlier
deployment. Later documentation-only commits do not change the deployed implementation.

The source changes are organized as:

- `7d848c9` — Firebase email/Google account flows, staff/contributor controls and local setup tooling.
- `82f4551` — JWT/account tests, distinct-user browser verification and current workflow evidence.
- `22d6e33` — README startup instructions, Firebase guide, account/security scope and repo guidelines.

The same [private website](https://airplane-games-community-prototype.givingstar7.chatgpt.site),
[admin](https://airplane-games-community-prototype.givingstar7.chatgpt.site/admin) and
[photographer portal](https://airplane-games-community-prototype.givingstar7.chatgpt.site/contribute)
retain their owner-private audience. No product domain or public launch was changed.

Public navigation retains native anchors because an earlier production audit reproduced a
Vinext beta prefetch issue. Historical Lighthouse/production-smoke artifacts predate the
Firebase integration unless their evidence explicitly records a later source checkpoint.

## Direct Cloudflare checkpoint (2026-10-23)

The user chose Cloudflare hosting first; Vercel bootstrap is saved separately in
commit `590a271` on `codex/vercel-setup`. Bunny Storage uses zone
`aviation-arcade-website`, Frankfurt (`de`). The Cloudflare connection switched
to account `049215df8c62c566983633f79093452c`; a fresh D1 database was created and its
three-table schema verified there. Runtime checkpoint `8ea2c22` passes TypeScript,
27 tests, production build and direct deployment dry run. The live Bunny upload,
identical-byte download and deletion passed using ignored `.dev.vars.cloudflare`.

The default-deploy correction is committed as `55bf91b`: portable builds restore the Bunny
Wrangler pointer, and `npm run deploy` rebuilds/prepares and supplies the ignored secrets file.
All 31 unit tests, TypeScript, focused ESLint, production build, wrapper dry run and bare
Wrangler dry run passed. A live deployment through the new command succeeded.

Worker `aviation-arcade-website` is live with D1/Bunny, production Firebase and encrypted
password/staff bindings. The user replaced the saved test staff address with a real email;
that deployed-secret update created deployment `9b99864e-c961-4d62-86d0-536bdefe6966`,
version `3685f364-23a2-45b2-8e1f-8ea8b60cc21b` at 100%. App code is checkpoint `55bf91b`.
The protected hostname is enabled, previews are disabled, and there are no custom domains
or R2 bindings. Firebase authorized the exact host
`aviation-arcade-website.karrtik-kmphitech.workers.dev`, preserving live existing domains.

The user approved and the agent configured Access organization `Airplane Games prototype`,
exact-host app `77c80c6f-1612-4726-bb7e-4c354202ac57`, an OTP provider and a reusable allow
policy restricted to the selected real email. Read-back matched before enabling the URL.
Six unauthenticated route probes redirect to Access and its email form loads successfully.
The user confirmed both Access and website Firebase sign-ins worked. Credential-free evidence
is in `docs/evidence/cloudflare-access-smoke.json`; full upload/editorial browser regression
on this host remains unverified.

The protected-host source target persists `workersDev: true`, defaults to false when absent,
and keeps previews disabled. All 32 tests, focused ESLint and the protected-target Wrangler
dry run pass. The original owner-private Site remains available and no product domain changed.

The official Cloudflare agent setup is complete: 19 global Codex skills, authenticated
Cloudflare MCP, and a verified read of the intended account. The user retained Wrangler
instead of the optional beta `cf` CLI. Progress was synchronized with the parallel
default-deployment chat: it completed the five build/deploy files, while this chat handled
host/access setup and these deployment records. See [Cloudflare setup](CLOUDFLARE_SETUP.md).
