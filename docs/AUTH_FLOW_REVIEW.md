# Account and authentication flow review

Reviewed 2026-10-22 against website checkpoint `2ade1d5` and original product documents.
Two Luna audits checked requirements and source; a 6.1 Sol medium review checked the corrective
plan. This records gaps and next jobs. It does not select a provider or implement account flows.

## Finding

The prototype has hosting authentication and server authorization. It does not deliver a complete
Airplane Games account experience. Treating host sign-in and the local demo as completion of the
account work was too broad. Shared app/web identity was deferred from implementation, but remains
a required product feature. The community/player name-tag journey is not specified or built.

| Surface | Present | Missing or unfinished |
|---|---|---|
| Admin | Conditional sign-in gate, host identity, staff email allowlist, displayed identity | Shared account controls, sign-out, full session states, production capability roles and verified MFA |
| Photographers | Conditional sign-in gate, private uploads, own submissions, revisions and ownership checks | Visible account/session controls, profile/onboarding, reauthentication journey and hosted multi-user verification |
| Community / players | Existing game Callsign and approved shared app/web identity requirement | Community login/onboarding, player name-tag profile, authoritative game-account linking and recovery |

The deployment remains owner-private. Hosting can authenticate the owner before rendering a page,
so an already signed-in owner will not see its anonymous sign-in gate. This explains preview
behavior without completing the product journey. Adding a login button would not by itself let
outside photographers use this owner-private site. This review does not change its audience.

## Requirements reconciled

- [Website requirements](C:/Unity/Projects/AviationArcade_v2/docs/website/WEBSITE_REQUIREMENTS.md:172):
  shared identity, signup/login, member sessions and recovery. Provider/topology remain open at
  line 188; the historical UGS note does not select a current website provider.
- [Client ruling, thread 22](C:/Unity/Projects/AviationArcade_v2/docs/implementation/CLIENT_FEEDBACK_BACKLOG.md:595):
  supersedes no-login. App and website share one account. Current device-bound callsigns do not
  supply that account or prove ownership.
- [Staff requirements](C:/Unity/Projects/AviationArcade_v2/docs/website/WEBSITE_ADMIN_MODULE_PLAN.md:137):
  capability roles, MFA and server authorization. Binary staff allowlisting does not complete them.
- [Account boundary](C:/Unity/Projects/AviationArcade_v2/docs/website/WEBSITE_ADMIN_MODULE_PLAN.md:249):
  staff identity is separate from player account decisions; nonfunctional public account claims
  must not ship.
- [ADR-0006](C:/Unity/Projects/AviationArcade_v2/docs/architecture/ADR-0006-account-identity.md:3)
  is Proposed. Provider/topology, guests, linking, merge, recovery, demo migration, reset/deletion
  and entitlements remain open. Resolve the policies relevant to each introduced behavior.
- Photo-portal documents capture metadata, rights and moderation, but not a complete photographer
  onboarding/recovery flow. The user's clarification makes that journey and future player community
  name tags explicit requirements; their detailed profile policies still need specification.

## Source evidence and verification limits

- `app/admin/page.tsx` renders sign-in or staff denial; `lib/server.ts` protects admin actions.
- `app/contribute/page.tsx` resolves optional identity; `components/SubmissionForm.tsx` renders
  sign-in or the submission workspace. Its sign-in destination currently drops original game and
  category query parameters.
- `components/PublicShell.tsx` has no account/session control. `components/AdminApp.tsx` displays
  identity but has no account menu/sign-out. `app/chatgpt-auth.ts` provides a sign-out helper with
  no visible caller. There is no product profile/account page.
- `db/schema.ts` stores submissions, editorial records and audit events, not profiles, game-account
  links or a name-tag registry. Editable photographer name/contact/credit are submission metadata.
- Ownership uses the host `userId`, not those editable fields. The Sites identity contract says
  this ID is stable within one Site and differs across Sites. It is not an already shared game
  principal. Preserve the host integration while verifying supported account integration options.
- Saved `docs/evidence/browser-qa.json` covers anonymous API denial and a fixed local demo sign-in,
  then submission/review operations. It does not prove hosted login/logout, expiry, distinct-user
  isolation or game linking. Production smoke covers navigation/catalog/theme, not account flows.
  No credentials, live login, recovery or MFA were exercised during this audit.

## Ordered corrective jobs

### A. Finish the current host-session experience

1. Add consistent desktop/mobile Account controls across public and editorial pages: signed-in
   state, My submissions, permitted editorial access and Sign out. Keep email private. Anonymous
   entry uses the existing top-level host sign-in and safe destination-preserving return paths.
2. Complete the photographer journey: contribute -> sign-in -> workspace -> My submissions ->
   requested changes -> revision/resubmit. Preserve safe category/game selections through login.
3. Handle cancellation, expired sessions, non-staff denial and account switching. Failed writes
   must not look submitted; do not claim uploads survive navigation without secure draft recovery.
4. Verify those states with browser/auth checks and authorized hosted test users. Keep current
   deployment access unchanged while implementing the flow.

These jobs can proceed without deciding game progress migration or choosing an external provider.
They do not deliver Airplane Games registration, password recovery or shared game identity.

### B. Specify profiles and player name tags

One account may have contributor and player capabilities. Staff privileges require explicit
assignment; choosing an onboarding role must never self-grant editorial access. Keep distinct:

| Value | Meaning |
|---|---|
| Account principal | Stable server-owned identity and authorization subject |
| Provider subject | Verified login identity mapped to the account |
| Callsign / player name tag | Public profile attribute, never a credential or ownership proof |
| Photographer credit | Per-photo attribution, which may differ from the player's tag |
| Contact email / full name | Private contact or account data with explicit display rules |

Propose reusing the existing game Callsign for the community player name tag, subject to confirming
that meaning and the authoritative claim service. Do not create a competing website registry.
Specify uniqueness/normalization, reserved names, changes/moderation, existing callsign conflicts,
privacy and unlinked-account behavior before implementing claims.

### C. Integrate shared app/web accounts

Resolve topology and applicable ADR-0006 policies with backend/site owners. Verify hosting-supported
integration before selecting another provider. Explicitly amend the frozen game contract; map verified
identities to the same principal and implement isolation, linking and recovery. Website profile work
does not authorize rewriting Unity identity or importing demo progress. Commerce stays deferred.
Production staff capability enforcement and verified MFA are separate jobs.

## Acceptance before calling account work complete

- Visible desktop/mobile sign-in state and sign-out; safe return destinations; accurate expiry and
  cancellation states; hosted sign-in/out checked independently of local demo evidence.
- Non-staff UI/API denial. Later staff capability tests distinguish review, publishing and support.
- Contributor A cannot list, read photos or revise B's proposals. Contact/credit edits cannot change
  ownership. Test distinct identities, not just the fixed local mock user.
- Private account data stays out of public identity/credit output; no hosted mock-login bypass.
- Later tests prove app/web principal equivalence, name conflicts, linking/recovery, migration replay
  and stale-response isolation across account changes. A profile form alone cannot establish this.

Resume with job A, then review job B's profile contract. Job C depends on account decisions and the
game contract. This audit changes documentation/tracking only; runtime behavior is unchanged.
