# Website prototype task board

Sole website/admin repository: `H:/Work/TheAviationArcade/website`.
Unity is a read-only reference for approved branding/content. Do not create a website
folder there. Read README.md and actual Git status when resuming.

## Accepted scope and decisions

- Homepage, eight-game catalog, photographer photo proposals, and admin for Aircraft
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
| Existing brand, homepage and eight-game catalog  | Complete                         | Original logo/fonts, optimized preview assets, responsive layouts, search/filter/theme                          |
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
| Backend sync (content, progress, catalog)        | Planned                          | [BACKEND_SYNC_PLAN.md](BACKEND_SYNC_PLAN.md); W1/W2 done, Military desk moves to the backend under C1 (W7/W8)   |
| Production staff capabilities/MFA                | Open                             | Binary verified-email allowlist is not the complete capability matrix                                           |
| Public-launch media and privacy hardening        | Open                             | Full decode/re-encode, abuse controls, approved rights and retention/deletion workflow                          |
| Mobile loading optimization                      | Follow-up                        | Historical pre-Firebase Lighthouse: performance 82, accessibility 100, best practices 100, LCP 4.1s             |
| Military readiness desk and batch release        | Implemented and locally verified | Client's 31-question sheet, stages, release checks, sample Trips; EditorialStore seam (W1); Trainee short       |

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

## Tab return keeps the page; role-based editorial entry (2026-10-26)

Switching back to a tab used to set the account state to loading for every focus,
`visibilitychange` and `pageshow`. `/admin` unmounted into "Checking account…", lost focus
and input, then refetched submissions, content and audit; each switch also re-sent the ID
token. Now a same-user re-check runs in the background and the page stays. Focus and
visibility count as one return, at most one check per 60 seconds (`shouldRecheckOnReturn`);
a back/forward-cache restore always checks. An unchanged ID token is not re-sent; if the
server reports no session while Firebase still has the user, the token is mirrored once more.
A different Firebase user, sign-in/out events and any 401/403/409 still block and clear private
data immediately. The server remains the only authority: `/admin` layout runs
`requireArea("admin")` and every `/api/admin/*` handler calls `staff()`.

Editorial entry points follow the server's `isStaff`: the footer "Editor workspace" link and the
account-page editorial wording are staff-only (the account menu and destination card already were;
the demo login box was already editor-page-only). Removed the submission form's now-unused
revalidation workaround.

Verification: TypeScript, 46 unit tests and the production build pass. New
`scripts/session-return-qa.mjs` passes 6 Chrome checks on the emulator-backed demo preview
(port 5186): repeated tab switches send no account/session/admin requests and keep the mounted
workspace; a forced re-check is one `GET /api/account`; a cleared cookie is restored without
blanking; staff see the footer link; sign-out in another tab clears the workspace; a photographer
sees no editorial link or wording. The same script fails 4 of 6 on the previous code.
`role-auth-qa.mjs` (unprefixed, port 5186) passed 9 workflows, then failed the read-only demo
check: the running preview denies the demo account on the previous code too (stale demo account
reference after an emulator restart), so it is environmental. `test:auth` was not run: it requires
port 5173, which was serving the cloud project. No live Google login or cloud behavior was tested.

## Military readiness desk (2026-10-27)

Staff now have **Military readiness** in `/admin`: the approved 30-aircraft roster in its
14/6/4/3/3 rank slots, each tracked through Missing photo → Rights checked → Content prepared
→ Previewed → Approved. A rank-coverage table counts each stage, inherits earlier ranks
and shows whether ten different approved aircraft exist for a Trip. Packages advance one
stage at a time and may step back; each stage needs its own evidence (photo source and
permission/attribution; https identity reference, answer, aliases, three distinct wrong answers
that never match an alias, hint, reveal; mobile crop; full preview checklist). An approved package
is locked until stepped back. Approval records a decision only: nothing is published, and
Military stays Coming Soon.

Packages are `editorial_records` rows with `kind='military'`, so **no schema migration** is
needed; the existing content list now selects only `identifier`/`potd`. Writes use the
existing base-version check and batched audit row (`military_<stage>`), require `staff()` and
same origin, and accept a contributed photograph only if it is a real submission approved for
game use (guarded again inside the write). The roster is code (`lib/military.ts`): replacing an
aircraft needs client approval and keeps its rank slot. The demo account does not see the desk.

⚠️ "Military Clipper Card mapping" is required by the brief but is not defined in the design docs
or the Unity project. It is a checklist confirmation only until its format is supplied.

Verification: TypeScript, 53 unit tests (7 new in `tests/military.test.mjs`), focused ESLint and
the production build pass. `scripts/military-qa.mjs` passes 8/8 Chrome checks on the
emulator-backed demo preview (port 5186) with zero page errors; one earlier run's 320px overflow
was a measurement before layout settled, and it passed on two later runs. Evidence:
[results](evidence/military-readiness/qa.json), [desktop](evidence/military-readiness/military-desktop-light.png),
[390 dark](evidence/military-readiness/military-dark-390.png), [320 roster](evidence/military-readiness/military-roster-320.png).
Hosted D1 and live sign-in were not tested; nothing was deployed.

## Military batch release (2026-10-27)

The Military desk now ends in **Batch release**. A release is refused unless every roster slot
is approved (rank coverage), every rank can form a Trip of ten different aircraft, and every
aircraft has a stored photograph that is a real contribution still approved for game use and
not reused for another aircraft (asset validation, checked by file digest on the server).
Licensed photographs must therefore be added through Contribute and approved so the file is
stored; a license link alone does not pass.

Staff open **sample Trips**: one per rank, ten different approved aircraft (the rank's own new
aircraft first, then earlier ranks), each showing the photograph, the four shuffled options and the hint.
They can be reshuffled. This is a read-only staff preview, not a playable quiz. Releasing requires
confirming the previews, and the server refuses a release whose package versions differ from the
previewed ones (`basis`), a stale release pointer, or a batch identical to the current release.

Each release is an immutable `editorial_records` row (`kind='military_release'`) snapshotting
all 30 packages with their versions and photo digests. A pointer row (`kind='military_pointer'`)
names the current release and the earlier ones; **Restore release N** makes the previous release
current again without deleting the replaced one. Both writes are versioned, guarded in SQL
against package or photograph changes since the checks, and audited (`military_released`,
`military_release_restored`). No schema migration. A release is a record only: nothing is
delivered to the game or published, and Military stays Coming Soon.

Verification: TypeScript, 56 unit tests (3 new), production build. `scripts/military-release-qa.mjs`
passes 7/7 Chrome checks on the emulator-backed demo preview, twice in a row and in either order with
`military-qa.mjs` (8/8, now compared against stored state instead of an empty database), with zero
page errors. Focused ESLint reports no new findings; the existing `AdminApp` effect lint error predates
this change. Evidence: [results](evidence/military-release/qa.json),
[desktop](evidence/military-release/military-release-desktop.png),
[390 dark](evidence/military-release/military-release-dark-390.png),
[320 light](evidence/military-release/military-release-light-320.png). Hosted D1 and live sign-in were
not tested; nothing was deployed.

Still open for Military: delivery of the current release to the game (format and endpoint are
not defined by the Unity project); selecting Trips by unique aircraft family in the game; the
⚠️ Clipper Card mapping definition; final photograph permission checks; real photographs for
all 30 aircraft.

## Military uses the client's sheet (2026-10-27)

The 30-aircraft roster above (14/6/4/3/3, post-war fixed-wing only) was **not decided by the client**;
it came from an earlier Claude session. It is withdrawn. The Military desk now holds exactly the
client's sheet `docs/Military Airplane Identifier v1.xlsx` (2026-10-26): **31 questions**, ranked as
supplied (Trainee 6, First Officer 5, Captain 6, Check Airman 8, Chief Pilot 6), including the WWII
aircraft, helicopters and the aircraft that appear at several ranks (Typhoon ×3, AW139 ×2, T-28 ×2).
Ids are the game's import ids (`mil-a1`…`mil-a31`, sheet row order), so the website and Unity v2
now share a key. The C-17 (row 5) came without its photograph; the editor says so.

- The answer and three wrong answers are always the sheet's: the editor shows them read-only and the
  server replaces whatever a browser sends (`clientContent`). Hint, reveal and aliases were never
  supplied, so they are no longer asked for and are stored empty.
- The photographer from the sheet prefills Attribution (empty for rows 14, 23, 25, 26).
- Trips follow the game's dealer (`InProcessMockBackend.BuildDeck`): up to 6 questions at the rank,
  the rest from lower ranks, topped up from the rank itself, never from higher ranks, never a question
  twice. Repeated aircraft are allowed, as in the game.
- Consequence: **Trainee has 6 questions, so no Trainee Trip can be dealt and a release is refused**
  until the client supplies at least 4 more Trainee questions. Release and restore stay implemented
  and unit-tested on a synthetic roster.
- Packages saved under the old slug ids are ignored. Local D1 still holds release records made from
  the old roster during QA (releases 1-5); hosted D1 never had any because that commit is not deployed.

Verification: TypeScript, 58/58 unit tests (`tests/military.test.mjs` rewritten, 12 tests), production
build. On the emulator-backed demo preview (port 5186), `scripts/military-qa.mjs` passes 9/9 and
`scripts/military-release-qa.mjs` passes 6/6, alternated twice in each order, zero page errors.
Evidence: [results](evidence/military-client-sheet/qa.json),
[desk](evidence/military-client-sheet/military-desktop-light.png),
[release](evidence/military-client-sheet/military-release-desktop.png),
[390 dark](evidence/military-client-sheet/military-release-dark-390.png),
[320 light](evidence/military-client-sheet/military-release-light-320.png). Hosted D1 and live sign-in
were not tested; nothing was deployed.

Client to confirm (Josh): 4+ more Trainee questions; the C-17 photograph; photographer names for rows
14, 23, 25, 26; whether the same aircraft may appear more than once in one Trip; what the Military
Clipper Card mapping is.

## Military desk behind EditorialStore (2026-10-29, brief W1)

The Military desk's reads and writes moved out of `app/api/[...path]/route.ts` into
`lib/editorial/`: `store.ts` (the interface, typed errors and the release rules every adapter shares),
`d1-store.ts` (the existing SQL, moved) and `memory-store.ts`. The route handlers are now short calls
that turn store errors into the same HTTP errors and messages as before. This is the seam the backend
adapter (W7) plugs into once the backend owns editorial content (C1, D-2).

- **A release is two steps (user, 2026-10-29).** `upload` records an immutable candidate ("uploaded",
  listed but not live). `activate` makes it live only if none of its package versions or linked
  photographs changed since the upload: the guard compares against the candidate's stored snapshot,
  including each contribution's version. Each step writes one audit event, so a release leaves two.
  "Release batch" still does both in one click; if another editor wins in between, the candidate stays
  visible and the desk offers **Make release N live** while it still matches the packages.
- The releases list in `GET /api/admin/military` now carries `status` (`uploaded` | `released`).
  New route: `POST /api/admin/military/releases/activate` `{ release, pointerVersion }`.
- A refused release still returns its reasons: `HttpError` gained an optional `errors[]` that
  `failure()` emits.
- Restore is unchanged: it moves the pointer without re-checking rights (open question in the brief).
- `tsconfig.json` allows `.ts` import suffixes so `node --test` can load the store modules.
- `tests/editorial-store.test.mjs` runs one contract suite (11 cases) against the memory adapter and
  the D1 adapter over `node:sqlite` with the real migration (`tests/support/d1-sqlite.mjs`). The
  release cases use a 10-question synthetic roster; the client's sheet still cannot fill a Trainee
  Trip (C13 is still waiting on Josh, so that block stays).

## One sign-in check per request and a declared route table (2026-10-29, brief W2)

- `lib/request/principal.ts` resolves who is asking once: the session cookie is parsed once and the
  Firebase token verified once (an admin save used to verify it four or five times). Staff, demo and
  the session key come from that one result. The member's token is kept as a `Bearer` that never
  serializes, ready for forwarding to the backend (W6). Pages (`currentViewer`), `/api/account` and
  the API all use it; `getProductUser`, `identity()`, `isStaff()` and `staff()` are gone.
- `lib/request/routes.ts` lists every API route with its audience (public, member, owner, staff) and
  whether it is a mutation. `lib/request/router.ts` runs the checks in one order: sign-in (guest 401,
  demo 403 DEMO_ACCOUNT), the account fence (409 ACCOUNT_CHANGED), staff (403), same-origin for
  mutations (403), then the handler. Public routes never verify a token. `app/api/[...path]/route.ts`
  only wires the Worker bindings in. HTTP errors and responses live in `lib/errors.ts`.
- Observable changes: a signed-out cross-origin submission POST/PUT now gets 401 instead of 403
  (both refuse); an unreachable Google key service now gives 503 instead of 500. Unchanged: a guest
  or demo request with a stale `X-Account-Session` still gets 401/403, and unknown paths under
  `admin/` still answer 401/403 before 404.
- Tests: `tests/principal.test.mjs` (6) and `tests/router.test.mjs` (9, an audience matrix generated
  from the table, run in Node over the memory store and the D1 shim).

Verification (W1 + W2): TypeScript; 95/95 unit tests (`npm test`). Against `npm run demo:preview`
(port 5186, Auth Emulator): `api-qa` 1/1, `session-return-qa` 6/6, `role-auth-qa` 10/10 (no prefix),
`military-qa` 9/9, `military-release-qa` 6/6. The vinext production build completes with these
changes in a clean worktree; in this checkout it stalls at its first step, as it does without them.
Hosted D1, live Google sign-in and the 22.13 Node floor were not tested; nothing was deployed.

## Backend sync plan committed (2026-10-29, brief W3)

[BACKEND_SYNC_PLAN.md](BACKEND_SYNC_PLAN.md) is re-scoped to the user's rulings and committed. Changed
from the 2026-10-28 draft: the backend owns game content (C1, D-2), so the website-written
`content-release.v1` package and the Bunny push are dropped and the desks become backend admin API
clients; the game shows the UGS copy first (C3); Cloud Code is adopted but outside purchases (C4); the
backend owns `POST /v1/trips` (C5); Field Award progress, Go Around and Logbook are backend-recorded
(C12); the catalog comes from Unity via the backend (D-5). It records the website's two seams
(`RequestPrincipal`/`BackendClient` and `EditorialStore`) and lists the open questions from the
website brief. **Military desk status:** works on D1 behind `EditorialStore`; to be migrated to the
backend (W8) once the backend has releases and a home for preparation evidence.

## Draft session out of AdminApp (2026-10-29, brief W5)

`lib/editorial/draft-session.ts` now holds the admin desk's request rules with no React: the base
version captured when an item is opened (a refreshed list never moves it), saves that send it and
adopt the server's version only on success, a 409 that keeps the local form and refetches, 401/403/
ACCOUNT_CHANGED that block the desk, and a generation counter so a response from before an account
change is dropped. Release, activate and restore carry the live pointer version the desk last showed.
`AdminApp` and `MilitaryWorkspace` keep their React state and call it; the inline `requestJson`,
`handleMutationError` and base-version state are gone.

Verification: TypeScript; 103/103 unit tests (`tests/draft-session.test.mjs`, 8 new). Against
`demo:preview`: `military-qa` 9/9, `military-release-qa` 6/6, `demo-admin-qa` 6/6. The first
`military-qa` run after the change failed four checks; with the change stashed it passed, and with it
restored it passed again, so the failure was not reproduced (most likely Vite reloading the page when
it first served the new module). `browser-qa`: its catalog check expected 7 cards and is corrected to
8; the first four checks pass, and the contributor step is refused by the 30-proposals-a-day limit,
which today's release QA runs used up in local D1. That step was not re-run.

## Submissions and content desks out of the route table (2026-10-29, brief W4)

- `lib/d1/kernel.ts` is the one implementation of "bump the version, compare-and-set, write the audit
  event in the same batch". Submission revisions and reviews, content saves and Military package saves
  use it.
- `lib/submissions/d1.ts` holds photographer submissions (they stay on the website, D-2): retry-key
  replay, the 30-a-day limit, owner-only revision, the ambiguous-acknowledgement reconciliation
  (unchanged), reviews and the demo loader. The route keeps the form and photo parsing.
- `lib/editorial/content.ts` + `content-d1.ts`: the Aircraft Identifier and Plane of the Day desks
  behind a `ContentStore` (list, create draft, save, featured), with the publishing rules and messages
  unchanged. D1 is the only adapter, on purpose: under D-2 this content moves to the backend, whose
  adapter replaces it. One change: creating a draft whose source photograph changed between the check
  and the insert now gives 409 instead of a 500.
- Tests: `tests/submissions.test.mjs` (7) and `tests/content-store.test.mjs` (7) over the D1 shim.

Verification: TypeScript; 117/117 unit tests. Against `demo:preview`: `api-qa` 1/1, `demo-admin-qa`
6/6, `military-qa` 9/9. `submissions-ui-qa` was not run: it is fixed to port 5173 and needs the
emulator profile there, while this checkout's `.dev.vars` points 5173 at the real Firebase project.

## Player progress from the backend (2026-10-29, brief W6)

Work now happens in `E:\TheAviationArcade\website`; the H: disk is failing.

- `lib/request/backend.ts`: `backendClient` calls the game backend server-to-server with only
  `Authorization: Bearer <the member's Firebase ID token>`, with no cookie and no service secret. It
  refuses redirects and has an 8 s timeout. With no `GAME_API_BASE_URL` it is "not connected". Errors
  keep the backend's status, stable `error.code` and `Retry-After`.
- `lib/progress/`: `ProgressSource` with the backend's `Progress` contract (openapi 0.4.0, strict,
  `version` included per D-1), `httpProgressSource` over `GET /v1/me/progress`, and a labelled,
  deterministic sample used only with `PROGRESS_SOURCE=mock` in a development build. Answers map to
  progress, no player yet (404 `player_not_found`), sign in again (401), unavailable (429/503/426,
  network, or an off-contract body) and not connected. The website never calls `PUT /v1/me`.
- `/play` shows those states. The name tag, games played, best streak, recent games and the linking
  copy are gone: the backend has no contract for them. `lib/player-mock.ts` is deleted.
- The website does not send `X-Client-Version`. Once the backend sets a minimum build, its answer is
  426 and the page says progress is unavailable, until the backend decides how web callers are
  treated (open question in the plan).
- `role-auth-qa`'s player check now asserts the honest "Not connected" page instead of the old sample.

Verification: TypeScript; 127/127 unit tests (`tests/backend-client.test.mjs` 5, `tests/progress.test.mjs`
5; a missing `Retry-After` header read as 0 s was caught and fixed). From E: against `demo:preview`:
`session-return-qa` 6/6, `role-auth-qa` 10/10; `/play` checked in a browser (Not connected). Not tested
against a running backend. `npm run build` completes on E: in 26 s, including deploy preparation (nothing
deployed); the earlier stalls happened only on the failing H: disk.

## Catalog contract vendored (2026-10-29, cross-repo XW1)

- `contracts/catalog.v1.json` is a byte copy of the backend's committed file (B2, `16351d0`);
  `.gitattributes` keeps it LF and `contracts/README.md` gives the copy rule.
- Every `lib/catalog.ts` game has a `backendId` (Military: `aircraft-identifier-military`; its URL
  slug `military-aircraft-identifier` and internal id stay website-local) and a `submissionCategory`,
  which replaces the contributor form's own slug-to-category map.
- `lib/rules.ts` exports `gameSlugs`, the enum the submission schema uses.
- `tests/catalog.test.mjs` (5): module ids equal the catalog's as a set and in ticket order, Military's
  slug and id, unique slugs, and the submission enum equals the catalog slugs.
- Also fixed a flaky assertion in `tests/submissions.test.mjs` that depended on two audit events
  having different timestamps.

Verification: TypeScript; 132/132 unit tests, five runs in a row; `npm run build` on E:.

## One rank list from the catalog (2026-10-29, cross-repo XW2)

`lib/catalog.ts` exports `ranks` (id, name, Status Points threshold), `rankNames`, `RankName` and
`RankId`, checked against `contracts/catalog.v1.json` in `tests/catalog.test.mjs`. The Military
desk (`militaryRankNames`), the content publishing rule in `lib/rules.ts`, the admin rank picker and
the progress contract and sample (rank ids, names, thresholds) all read it; their own literals are
gone. The player-mock half of XW2 was already done: the mock was replaced in W6.

Verification: TypeScript; 133/133 unit tests, three runs; `npm run build` on E:; against
`demo:preview` from E:, `military-qa` 9/9 and `demo-admin-qa` 6/6.

## Website calls exempt from the app version gate (2026-10-29)

Every backend call from the website's server now sends `X-Client: web` (and never
`X-Client-Version`), the label the backend's version gate skips (user ruling, backend `3651ccc`,
openapi 0.5.0). It is not a credential; the member's Bearer is still verified. A 426 therefore no
longer applies to `/play`. Test: `tests/backend-client.test.mjs` (header on progress and other calls).
Verification: TypeScript; 134/134 unit tests.

