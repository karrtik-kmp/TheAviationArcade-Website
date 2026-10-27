# Approved website and military launch direction

Approved by the client in the website design interview on 2026-10-26. This is the
implementation brief; approval of a feature does not mean it is implemented or published.
The existing website palette, brand assets and typography remain unchanged.

## Website and account access

The public website introduces Airplane Games and directs visitors to the mobile app.
Admin belongs on a separate subdomain. Domain routing and production account configuration
need their own implementation and verification; existing route URLs remain compatible.

Public sign-in uses a real aircraft photograph beside a compact form on desktop. Mobile
prioritizes the form and omits the large photograph. Keep Jost for the wordmark, Barlow
Condensed for headings, Poppins for body, and the current light/dark color tokens.
Visitors do not need to choose a role before signing in. Staff have a separate entry.

Retain Google and email/password authentication. Public browsing does not require login.
Successful sign-in returns to the requested action; direct sign-in returns to the homepage.
Cancellation, errors, account creation and recovery retain destination context. A game-started
sign-in must support an app-return handoff and visible retry, once shared identity is integrated.

Email/password accounts verify email before comments or photo submissions. Additional sign-in
methods must be connected explicitly with proof of account ownership. Normal recovery uses
email reset or the provider's recovery; otherwise offer private support without promising
restoration. Do not automatically create a replacement game profile. A Callsign is public
identity, not proof of ownership. Preserve the authoritative game identity and Callsign;
do not create a competing website registry or claim linkage before integration.

## Community permissions and moderation

Launch categories are Aircraft Identification, Aviation Photography, Game Feedback & Help,
and Announcements. Anyone can read. Only admins create or edit topics; verified members can
like, share, comment and discuss. The client's later restriction on topic creation overrides
the earlier open-posting proposal. Member comment-editing policy is not yet specified.

The first member comment requires approval. Subsequent comments can publish immediately,
subject to posting limits and moderation. Admins handle reports, removals, topic locks,
suspensions, bans and private appeals. Record actions and give affected members a reason.
A separate moderator role is pending. Public participation waits until an admin owns queue
and report review. No direct messages, anonymous participation or reputation privileges at launch.

Forum photo sharing is separate from contributions for game use. A forum upload does not
grant game-use permission. Preserve the dedicated rights and approval workflow.

## Military catalog and difficulty

**Corrected 2026-10-27.** An earlier version of this section listed a 30-aircraft post-war fixed-wing
roster (14/6/4/3/3 slots, helicopters and WWII deferred, Hornet instead of Super Hornet). That roster
was drafted by Claude, not decided by the client, and is withdrawn.

Military uses only what the client supplied: `docs/Military Airplane Identifier v1.xlsx` (2026-10-26),
31 questions with their rank, answer, three wrong answers, photo file and photographer, exactly as
written. It includes WWII aircraft, helicopters and aircraft repeated at several ranks.

| Rank | Questions in the sheet | Eligible total |
|---|---:|---:|
| Trainee | 6 | 6 |
| First Officer | 5 | 11 |
| Captain | 6 | 17 |
| Check Airman | 8 | 25 |
| Chief Pilot | 6 | 31 |

Higher ranks draw on lower ranks as the game does: up to six questions from the pilot's own rank,
the rest from below, never from higher ranks, never the same question twice in a Trip of ten.
With six Trainee questions, a Trainee Trip cannot be filled until the client supplies more. Website
and game use the same question ids (`mil-a1`…`mil-a31`). Changes to an aircraft, rank or answer
come from a new client sheet.

## Content preparation and release

Admins store the client's photograph for each question (through Contribute) and track it through
Missing photo, Rights checked, Content prepared, Previewed and Approved.

Each package needs a stored photograph with source, permission and attribution; verified aircraft
identity with a reliable reference; the client's answer and wrong answers (not edited on the website);
a mobile crop check; and a Military Clipper Card mapping (⚠️ not yet defined by the client).
Hints, reveal explanations and aliases were not supplied and are not required.

One admin can prepare and approve a package, with mandatory preview/checklist and an approval
record. Approval does not publish. Explicit batch release requires asset validation, rank coverage,
complete ten-question Trips, sample Trip previews and a way to restore the previous release.
Military stays Coming Soon until every package and the playable integration pass their checks.

## Implementation gaps

- Separate admin hostname routing and deployment configuration.
- Shared app/web identity, authoritative Callsign linkage and app-return handoff.
- Explicit provider linking and private support recovery workflow.
- Community topics, reactions, comments, first-comment approval, reports and admin moderation.
- Military delivery to the game. The per-aircraft stage tracker, readiness report, batch release with
  asset validation, sample Trip previews and release restore exist in the admin Military desk (2026-10-27).
- Military Clipper Card and session mapping (client to define).
- Final photography permission checks before a public launch.

The sign-in layout checkpoint addresses the public page and safe homepage/action redirects.
It does not claim the remaining features above are available.
