# Website prototype task board

Source directory: `H:/Work/TheAviationArcade/website`. This is the sole website/admin repository.
The temporary scaffold under the Unity project was removed after the user's directory correction.
The Unity project is a read-only source of existing branding and preview assets for this work.

## Accepted scope

The user approved the homepage, seven-game catalog and Aircraft Identifier / Plane of the Day
admin prototype, then brought community photo proposals into this slice. A further instruction
authorized predefined Luna subagent tasks, demo login/content and fetching online assets or data.
The project preserves existing fonts, logo and semantic brand colors. Browser gameplay and real
player account linking, purchases and game-backend publishing remain outside this prototype.

| Job | Owner | State | Evidence / next action |
|---|---|---|---|
| Existing-brand asset preparation | Asset worker | Complete | Self-hosted fonts, optimized real previews, generated decorative community illustration; provenance recorded |
| Photographer portal | Luna worker | Complete, integrated | All categories, private upload, metadata, rights offers, own proposals and revisions |
| Admin workspace | Luna worker | Complete, integrated | Official Fluent components, staff gate, queue, five checks, drafts, scheduling and activity |
| Rule tests / source review | Luna worker | Complete | Seven focused tests pass; source review recorded in SECURITY_REVIEW.md |
| Homepage, catalog and public pages | Frontend lead | Complete, integrated | Responsive composition, seven routes, search/filter, theme and availability states |
| Online reference snapshot | Frontend lead | Complete | Fifteen OurAirports records, original public-domain license, source checksum and repeatable fetch script |
| D1/R2 workflow and demo seed | Frontend lead | Implemented | Versioned operations, private media, server permission checks, idempotency and explicit nonpublishable demo data |
| Browser verification | Frontend lead | Complete | Eight Chrome workflows pass, plus concurrent retry/photo-retention and light-theme/360px layout checks; evidence in docs/evidence |
| Locked production build | Frontend lead | Complete | Fresh locked install, TypeScript and seven rule tests pass; final build and production browser smoke pass |
| Source checkpoint / private publication | Frontend lead | Complete | Source committed and private deployment succeeded; owner-only audience retained |
| Further mobile loading optimization | Frontend lead | Follow-up | Lighthouse performance 82; throttled-mobile LCP 4.1s remains above the 2.5s target |

## Resume contract

Read README.md, PROTOTYPE_SCOPE.md, ASSET_PROVENANCE.md and actual Git status before resuming.
Run TypeScript, rule tests and the recorded browser workflow against the current source. Browser
QA uses the existing bundled Playwright package when the built-in browser sandbox is unavailable.
Local `.dev.vars`, database state, runtime caches, dependencies and publication archives are ignored.
Staff settings are configured as hosted secrets and are not source-controlled.

The current source of truth for successful browser checks is the saved JSON, not an earlier
partial run. The published implementation is commit `ddd569f56076f4ecf39372bc97b6d99ef68e9aab`.
Deployment `appgdep_6ada0d235e1c81919f72b7a40515f32f` succeeded on 2026-10-22:
[private website](https://airplane-games-community-prototype.givingstar7.chatgpt.site),
[admin](https://airplane-games-community-prototype.givingstar7.chatgpt.site/admin) and
[photographer portal](https://airplane-games-community-prototype.givingstar7.chatgpt.site/contribute).
The hosted site uses owner sign-in; local development provides the no-password demo editor.
The real product domain was not changed. Later documentation-only commits do not change this
deployed implementation checkpoint.

Quality follow-up: production Lighthouse found a Vinext beta prefetch error, so public navigation
uses native anchors. The brand fonts now have WOFF2 derivatives and critical-face preloads, and
photographs have smaller WebP derivatives. The final production build/audit is recorded at handoff.

Final production audit: accessibility 100, best practices 100, performance 82, CLS 0 and total
blocking time 0ms. The console prefetch error is gone. SEO is 63 because this private prototype
deliberately uses noindex/nofollow; search indexing is not activated. These are local lab results,
not field Core Web Vitals. Public-launch upload hardening, approved legal/retention policy, verified
store links and real game-backend delivery remain later work.
