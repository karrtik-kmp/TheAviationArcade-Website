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
| Focused rules and auth tests                     | Complete                         | 20 unit tests pass; TypeScript passes                                                                           |
| Core browser/API regression                      | Complete                         | Eight workflows, concurrent retry, photo retention and narrow/light layouts pass                                |
| Locked production build                          | Complete                         | Final integrated source builds successfully                                                                     |
| README and repo guidelines                       | Updated                          | Two-terminal setup, demo seeding, local routes, Windows fallback, auth/data boundaries                          |
| Organized source commits and private publication | In progress                      | Preserve existing history and Site audience; record final checkpoint below                                      |
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

The previous runtime checkpoint was `ddd569f56076f4ecf39372bc97b6d99ef68e9aab`, deployed as
`appgdep_6ada0d235e1c81919f72b7a40515f32f`. The Firebase integration is being prepared as the
next checkpoint; until its deployment receipt is recorded, do not call it hosted verification.

The same [private website](https://airplane-games-community-prototype.givingstar7.chatgpt.site),
[admin](https://airplane-games-community-prototype.givingstar7.chatgpt.site/admin) and
[photographer portal](https://airplane-games-community-prototype.givingstar7.chatgpt.site/contribute)
retain their owner-private audience. No product domain or public launch was changed.

Public navigation retains native anchors because an earlier production audit reproduced a
Vinext beta prefetch issue. Historical Lighthouse/production-smoke artifacts predate the
Firebase integration unless their evidence explicitly records a later source checkpoint.
