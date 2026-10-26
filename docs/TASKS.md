# Website prototype task board

Sole website/admin repository: `H:/Work/TheAviationArcade/website`.
Unity is a read-only reference for approved branding/content. Do not create a website
folder there. Read README.md and actual Git status when resuming.

## Accepted scope and decisions

- Homepage, seven-game catalog, photographer photo proposals, and admin for Aircraft
  Identifier and Plane of the Day, preserving the existing branding.
- Product authentication: Firebase email/password and Google only. The Cloudflare preview
  is public; hosting identity must not grant product permissions.
- Callsign is the existing community player name tag. Game-account linkage and an
  authoritative Callsign claim service remain future work; do not create another registry.
- Luna handles scoped implementation; 6.1 Sol low/medium handles complex planning/review.
- Demo content/credentials remain local and nonpublishable. Browser gameplay,
  commerce and game-backend content delivery are outside this slice.

The client-approved direction from 2026-10-26 is recorded in
[Approved website and military launch direction](APPROVED_WEBSITE_DIRECTION.md).
It adds admin-only community topics, member comments/reactions and admin moderation,
a separate admin subdomain, and the approved 30-aircraft Military sourcing roster.
These are implementation requirements, not a claim that those features have shipped.

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
| Focused rules, auth, storage and deploy tests    | Complete                         | 32 unit tests pass; TypeScript and focused deploy-tooling ESLint pass                                           |
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
At that checkpoint, the protected hostname was enabled, previews were disabled, and there were no custom domains
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

## Contributor form alignment (2026-10-23)

Corrected the radio/checkbox alignment in **Rights & proposed use**. The shared text-field
selector also matched these native controls, applying 46px minimum height and text-field
padding. It now excludes radio/checkbox inputs; choice controls keep an 18px box, no padding
and a consistent 9px label gap. The mobile header can wrap when its account controls and
wordmark exceed the available width, eliminating the observed 320px horizontal overflow.

Local Chrome checks passed at 320, 390, 768, 958, 1024 and 1440px in both themes:
all 13 controls aligned, no horizontal overflow, textarea sizing retained, radio exclusivity,
channel/game/consent selection and keyboard Space toggling passed, with no page errors.
TypeScript, all 32 existing tests and the production build passed. Browser checks used the
demo Firebase Auth emulator; the original local settings were restored byte for byte.
See [verification evidence](evidence/contributor-alignment-qa.json) and
[corrected desktop form](evidence/contributor-alignment-desktop-dark.png).

The live site is not updated yet. Automatic approval review rejected the pre-deployment
remote Worker configuration read as outside the request's authorized account access.
Remote inspection/publication requires user approval; no deployment was attempted.

## Public Cloudflare preview (2026-10-23)

The user explicitly approved removing the Cloudflare email-code gate and making
[Airplane Games Preview](https://aviation-arcade-website.karrtik-kmphitech.workers.dev)
public to anyone with the link. Deleted exact-host Access application
`77c80c6f-1612-4726-bb7e-4c354202ac57`; API read-back confirmed it is absent.
This supersedes the private-host access state above. The original managed Site remains private.

The Worker route remains enabled; version-specific preview URLs remain disabled. Removed the
deleted app metadata from the source target. Firebase account and staff authorization remain
active: five public page shells and an image return 200 without the Access gate, anonymous
account state has no user/staff session, and six private API probes return 401. Evidence:
`docs/evidence/cloudflare-public-preview-smoke.json`. No runtime upload was needed for this
Cloudflare access-setting change. Signed-in upload/editorial regression remains pending.
The five existing deployment regression tests and `git diff --check` pass after the source
target update.

## Resettable demo workspace (2026-10-23)

Added `/demo`, a Firebase-backed preview with general preferences, service scenarios, imported
game content, daily-feature drafts, illustrative submission-review states and website/service
status. The importer records metadata provenance and hashes from the Unity project: 31 client
Identifier questions, five POTD entries and all eight registry entries including the gated
Commercial/Military split. Game preferences, hints, rank thresholds, local-midnight rules and
deferred monetization retain the current source values. Photos and publication rights are not copied.

The demo sign-in can prefill explicitly configured sample credentials. Its actual namespaced
Firebase UID is blocked from live contributor/editorial APIs and staff access; `/admin` and
`/contribute` lead it to the demo instead. Browser drafts are validated, scoped to the account,
saved explicitly and resettable. Real account/session verification remains Firebase.

Local `npm run demo:preview` uses a separate emulator profile on port 5186 and does not alter
`.dev.vars` or provision a hosted account. All **36/36 unit tests**, TypeScript, focused lint
and production build pass. **8/8 Chrome checks** pass with no page errors: demo prefill/login,
server live-data denial, save/reload/reset, catalog/filtering, POTD/review draft persistence,
no content API writes, distinct-account isolation, and all sections at 320/390/768/1440px in
light/dark themes. Screenshots were visually reviewed. The pre-existing AccountPage effect
lint error and AuthForm navigation warning were observed and left out of scope.

The user subsequently approved the exact hosted demo account, public sample credentials,
encrypted Worker bindings and deployment. Provisioned `demo@airplane-games.test` in Firebase
project `airplane-games-auth-20261022` without staff privileges or a verification override.
The runtime checkpoint is `feb4cba`, deployment `b99b08b5-e08c-4449-b156-a2afdc5c4b98`,
version `bccfe168-5004-4557-98ad-3416ccf57d06` at 100%. Read-back confirms the actual UID
restriction and encrypted demo credential bindings. The current public audience, D1, Bunny,
staff allowlist and disabled version-specific previews remain intact.

All **8/8 hosted Chrome checks** pass with zero page errors: anonymous gate, real Firebase
prefill/login, save/reload/reset, denied live-data APIs plus `/admin`/`/contribute` redirects,
imported content/filtering, local POTD/review drafts with no content API writes, all five
sections at 320/390/768/1440px in both themes, and sign-out followed by anonymous 401.
The first browser probe preceded rollout propagation; fresh page/asset probes and the complete
rerun passed. No production content was written. Hosted screenshots were visually reviewed.

See [demo setup](DEMO_PREVIEW.md), [local evidence](evidence/demo-workspace/qa.json),
[hosted evidence](evidence/hosted-demo-workspace/qa.json) and the
[inherited dependency advisory assessment](evidence/demo-workspace/dependency-audit.md).
The audit is not clean; the identified vulnerable server/image/gRPC paths were not found in
the generated Worker. Updates remain a separate compatibility checkpoint, review 2026-10-30
and before a production-domain launch. No new shared game identity or browser play was introduced.

## Contributor refresh and spacing fix (2026-10-23)

Runtime checkpoint `6562e35` stops same-account focus/visibility/token checks from
replacing the contributor UI or automatically fetching the submissions list again.
Loaded rows remain visible during manual refresh, unsent drafts remain mounted,
and writes wait for account validation. Firebase identity changes and failed
validation continue to hide private data; a failed-check retry stays gated until
confirmation succeeds. Contributor-scoped spacing now separates the hero, tabs,
heading and empty state, with responsive padding down to 320px.

Reviewed with separate implementation, layout and session-review subagents. The
original browser repro failed on background-check visibility and manual-refresh
row visibility; the focused regression is now 13/13. An isolated checkout of the
runtime checkpoint passes TypeScript, 32 unit tests, production build and the
Cloudflare deployment dry run. Full local auth regression: 13 passed, one Google
provider check skipped, zero failures. This does not establish live Google login.
Evidence and responsive screenshots: `docs/evidence/submissions-ui/`.

The live preview has **not** been updated by this task. Automatic approval review
rejected publishing because the page-fix request did not explicitly authorize
updating the shared Cloudflare service; deployment awaits the requested approval.
The tested release is retained in ignored `outputs/submissions-release-6562e35`.
Unrelated demo-workspace changes in the shared checkout are excluded from it.

## Demo account reverted to view-only admin samples (2026-10-23)

At the user's request, the `/demo` workspace and its browser-saved edits were removed: imported
game snapshot, editable settings, POTD/review drafts, `demo:import` and the Account page card.
The demo login remains and now opens a view-only `/admin` showing only the earlier Load demo data
drafts (Aircraft Identifier and Plane of the Day). Submissions and Activity are hidden; server
403 denial for the demo UID is unchanged. The phone editor overflow (warning bar forcing a wide
grid column) is also fixed for staff. TypeScript, 35 unit tests, production build and six local
browser checks pass; see [demo setup](DEMO_PREVIEW.md). The view-only implementation
was committed as `1a01cf5`; no hosted deployment is established by those local checks.

## Role sign-in and base-path corrections (2026-10-23)

Admin, photographer and player now enter through `/admin/sign-in`,
`/contribute/sign-in` and `/play/sign-in`. The legacy `/sign-in` forwards to the
appropriate audience, retaining safe return destinations. Only the admin entry
advertises the configured read-only demo login. Server staff/ownership checks and
account-change protections remain in force regardless of the selected entry point.

`SITE_BASE_PATH` configures the build-time URL prefix. Native links, API calls,
images and full-page navigation accept unprefixed app paths and add that prefix
once at the URL boundary. The helper no longer guesses that a route matching the
prefix has already been prefixed; `/play` as a prefix correctly produces
`/play/play` and `/play/play/sign-in`. Browser pathnames are converted back with
`appPath`; framework server redirects receive app paths.

The new player screen is explicitly a sample. It no longer fabricates linked app
accounts/dates or claims that website and game identities already match. App
profile linking is coming soon and will use the existing Callsign. No new name
registry or game-account integration was introduced.

Verification: TypeScript, a production build with `/play`, and 43 unit tests pass, including regressions for
`/admin`, `/contribute` and `/play` prefix collisions. Seven Chrome workflows pass
against the dedicated loopback preview with the actual `/play` prefix: audience
entry/demo visibility, anonymous and legacy redirects, signup/email verification,
honest player preview/assets, photographer filter return/logout, non-staff admin
denial, and read-only demo login. No page errors, failed assets, unprefixed
fonts/media or external requests were recorded. The throwaway emulator account was
deleted after the run. Evidence and screenshot: `docs/evidence/role-auth/`.

Lint remains at the inherited 18 errors and 18 warnings; this checkpoint does not
claim a clean lint baseline. Live Google consent and real game linkage remain
untested. README.md documents the role URLs, prefix setting and reproducible test.
This work is a local source checkpoint; it does not publish a hosted deployment.

## Public sign in layout and destination context (2026-10-26)

Public sign-in now uses a compact brand header, the existing aircraft photograph beside
the desktop form, and a form-first mobile layout with the photograph hidden. Existing
cream/navy/brass/action tokens and Jost/Barlow/Poppins are unchanged in both themes.
The form no longer asks visitors to choose a role. Legacy audience links keep their area;
safe return paths keep the original action, query and fragment. Direct public sign-in
returns home. Password reset retains email and destination, omits the Google control,
and the password field has an accessible visibility toggle. Mode switches are disabled
during requests. Staff entry and read-only demo permissions remain separate.

The browser regression exposed that the prefixed homepage requires `/play/`, while
`/play` returns 404 in this framework. `sitePath("/")` now keeps the trailing slash;
unit tests cover root hosting and colliding `/admin`, `/contribute`, `/play` prefixes.

Verification: TypeScript, 45 unit tests and the production build pass. Ten Chrome
workflows pass under an actual `/play` prefix, covering audience context, anonymous
guards, 320/390/768/1440px layouts in both themes, recovery, password visibility,
signup/verification, player preview, contributor filter return, direct/unsafe homepage
return, non-staff admin denial, and read-only demo permissions. No page exceptions,
failed static assets, unprefixed assets or external requests were recorded.
Focused runtime ESLint reports no errors and one existing-pattern `img` optimization warning.
The focused code review found no actionable regressions.

Evidence: [browser results](evidence/signin-refresh/qa.json),
[desktop light](evidence/signin-refresh/signin-light-1440.png),
[mobile dark](evidence/signin-refresh/signin-dark-390.png), and
[Lighthouse summary](evidence/signin-refresh/lighthouse-summary.json).
The local built-page mobile audit measured performance 82, accessibility 100 and best
practices 100; LCP 4.1 seconds misses the 2.5-second target. That run used the
auth-unconfigured state and does not establish hosted Core Web Vitals or live Google login.
Full audit reports remain under ignored `outputs/signin-refresh/`.

The local Auth Emulator restart required refreshing only the ignored demo profile's
account reference. Final browser checks ran on an isolated source snapshot with the
fresh fixture, preserving the user's running source servers. The isolated contributor
database was empty; this auth/layout suite does not establish full submission-list or
editorial regression. The throwaway browser account was deleted after testing.

The approved future scope is in `APPROVED_WEBSITE_DIRECTION.md`. Shared game identity,
app-return handoff, hostname separation, forum features and Military editing/delivery
remain pending. This checkpoint does not publish or change domain configuration.
