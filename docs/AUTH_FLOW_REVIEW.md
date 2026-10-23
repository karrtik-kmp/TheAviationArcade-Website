# Account and authentication flow review

Updated 2026-10-23. The initial audit at `69176cd` found that hosting authentication
had been mistaken for a complete product account journey. Two Luna audits and a
6.1 Sol medium review informed the correction. The user then selected Firebase
email/password and Google, and confirmed Callsign as the community player name tag.

## Implemented correction

| Surface                 | Current behavior                                                                                                | Remaining scope                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Product sign-in         | Email/password registration and sign-in, Google popup, password reset, email verification and resend            | Live Google account consent is a human check; emulator Google is simulated |
| Shared account controls | Desktop/mobile account menu, private display name, My account, My submissions, permitted editor link and logout | Authoritative game-account linkage                                         |
| Photographers           | Safe category/game return path, own proposal list, private photos, requested changes and owner revisions        | Public-launch onboarding, retention and deletion policy                    |
| Admin                   | Verified Firebase email plus server allowlist, explicit non-staff denial, account controls and logout           | Capability roles and enforced MFA                                          |
| Community / players     | Existing Callsign is the agreed public player name tag; account page explains pending linkage                   | Shared game principal, linking/recovery and Callsign claim service         |

Product identity remains separate from any hosting access gate. The direct Cloudflare
preview is publicly viewable; its private account and editorial actions still require
Firebase authentication. Product routes ignore hosting identity headers. No
“Sign in with ChatGPT” product action remains.

Role entry points are `/admin/sign-in`, `/contribute/sign-in` and `/play/sign-in`;
all use the same website Firebase identity. The legacy `/sign-in` forwards based on
the safe return destination. Entry-point selection does not confer staff access.
The player area has sample data only and always shows app profile linking as
coming soon. It does not claim shared Unity identity or fabricate a linked date.

`SITE_BASE_PATH` is the build-time prefix for these routes. The role browser suite
passes seven workflows under the colliding `/play` prefix, including verification,
filter returns, role denial and logout. See `docs/evidence/role-auth/qa.json` and
README.md for commands and limits.

## Identity and session contract

- The server verifies Firebase tokens against the configured project, issuer,
  audience and fixed Google signing keys. Only password and Google providers are accepted.
- Content ownership uses `firebase:<projectId>:<uid>`. Editable names, contact email
  and photo credit cannot establish ownership or staff access. Legacy host-owned
  records are not reassigned by email.
- A verified session is stored in an HttpOnly, SameSite cookie with a lifetime
  bounded by token expiry and one hour. Production cookies use Secure and the
  `__Host-` prefix. Mutating auth requests require the same Origin.
- The shared account provider revalidates on identity/focus changes. Generation
  guards discard stale responses; a server-checked account fingerprint fences
  private requests. An account change cannot automatically retry a write.
- Client session exchanges and logout are serialized. Web Locks coordinate tabs
  where supported; the fallback only serializes inside each tab.
- Unsaved drafts survive ordinary revalidation in memory, with actions blocked
  until the account is confirmed. Lost/changed access clears private state. Draft
  versions are captured on open so a refetch cannot hide a concurrent-edit conflict.

## Requirements retained

The original [website requirements](C:/Unity/Projects/AviationArcade_v2/docs/website/WEBSITE_REQUIREMENTS.md:172)
and [client shared-account ruling](C:/Unity/Projects/AviationArcade_v2/docs/implementation/CLIENT_FEEDBACK_BACKLOG.md:595)
still require one app/web account. Website Firebase setup alone does not amend the
frozen game contract or link a device-bound Callsign. [ADR-0006](C:/Unity/Projects/AviationArcade_v2/docs/architecture/ADR-0006-account-identity.md:3)
remains Proposed for the wider topology, guests, linking, merging, migration and recovery policies.

Callsign is a public attribute, never a credential. Do not build a competing website
registry. Photographer credit may differ from Callsign; private contact details must
not become public account identity. Staff privileges must never be self-selected.

## Verification and limits

The complete unit suite passes 43 checks. The earlier full Firebase browser/emulator run recorded
13 passes and one skipped Google provider check, including actual registration, verification, password reset and logout,
plus distinct-contributor isolation and stale-account mutation rejection. Google
SDK loading is blocked by the local harness; its popup did not complete. No live
Google sign-in or real email delivery is claimed. Saved results are in `docs/evidence`.

Local evidence does not prove shared Unity identity, immediate token revocation,
capability roles or MFA. Already-issued JWTs remain valid until expiry unless an
additional revocation service is introduced. See [security review](SECURITY_REVIEW.md)
and [Firebase setup](FIREBASE_SETUP.md).
