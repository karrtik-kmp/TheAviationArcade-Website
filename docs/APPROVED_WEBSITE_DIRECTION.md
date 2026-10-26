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

Launch with 30 distinct post-war fixed-wing military aircraft types or families. Helicopters,
drones, WWII aircraft and earlier aircraft wait for later expansions. Use an international
roster without country quotas. Closely related variants count as one launch entry.

| Rank | New aircraft | Eligible total |
|---|---:|---:|
| Trainee | 14 | 14 |
| First Officer | 6 | 20 |
| Captain | 4 | 24 |
| Check Airman | 3 | 27 |
| Chief Pilot | 3 | 30 |

Higher ranks inherit earlier content. Each Trip contains ten different aircraft types,
not merely ten different photo IDs. Individual assignments remain provisional until
photograph review and player testing; retain the approved rank counts.

| Rank | Aircraft sourcing targets |
|---|---|
| Trainee | F-16 Fighting Falcon; F-15 Eagle; F-22 Raptor; F-35 Lightning II; A-10 Thunderbolt II; B-2 Spirit; B-52 Stratofortress; C-130 Hercules; C-17 Globemaster III; E-3 Sentry; U-2 Dragon Lady; SR-71 Blackbird; Harrier; MiG-21 |
| First Officer | F-14 Tomcat; F/A-18 Hornet; Eurofighter Typhoon; Dassault Rafale; Airbus A400M Atlas; B-1 Lancer |
| Captain | Saab Gripen; Dassault Mirage 2000; MiG-29; BAE Hawk |
| Check Airman | HAL Tejas; Leonardo M-346; A-29 Super Tucano |
| Chief Pilot | JF-17 Thunder; Pilatus PC-21; Kawasaki P-1 |

Source the original F/A-18A-D Hornet for its slot; defer a separate Super Hornet challenge.
Do not demand a variant designation when the approved answer is the aircraft family.
Difficulty comes from recognition knowledge and meaningful similarities, not an unfair crop.

Names and roles were checked against official sources: [USAF catalog](https://www.af.mil/About-Us/Fact-Sheets/Aircraft-Factsheets/),
[RAF catalog](https://www.raf.mod.uk/aircraft/), [USAF museum](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Cold-War-Gallery/),
[US Navy Hornet collection](https://www.history.navy.mil/content/history/museums/nnam/explore/collections/aircraft/f/f-a-18-hornet--tactical-.html),
[Dassault](https://www.dassault-aviation.com/en/defense/rafale/),
[Saab](https://www.saab.com/products/gripen-c-series),
[India DDP](https://www.ddpmod.gov.in/en/resources/products/lca-tejas),
[Italian Air Force](https://www.aeronautica.difesa.it/en/2024/06/19/t-346a/),
[Embraer](https://www.embraer.com/defense-security-air/a-29-super-tucano/en/),
[Pakistan DEPO](https://depo.gov.pk/single_product.php?pid=130),
[Pilatus](https://www.pilatus-aircraft.com/en/pc-21), and
[Kawasaki](https://global.kawasaki.com/en/mobility/air/aircrafts/p_1.html).
Aircraft selection does not establish photograph availability or usage rights.

## Content preparation and release

Admins check the existing collection first, then fill gaps with photographer contributions
or separately licensed photographs. Track each aircraft through Missing photo, Rights checked,
Content prepared, Previewed and Approved. A replacement aircraft needs client approval and
must preserve its rank slot.

Each package needs a real photograph with source, permission and attribution; verified aircraft
identity with a reliable reference; displayed answer and aliases; plausible unambiguous wrong
answers; difficulty; hint; reveal explanation; mobile crop; and a correct military Clipper Card mapping.

One admin can prepare and approve a package, with mandatory preview/checklist and an approval
record. Approval does not publish. Explicit batch release requires asset validation, rank coverage,
complete ten-aircraft Trips, sample Trip previews and a way to restore the previous release.
Military stays Coming Soon until all 30 packages and the playable integration pass their checks.

## Implementation gaps

- Separate admin hostname routing and deployment configuration.
- Shared app/web identity, authoritative Callsign linkage and app-return handoff.
- Explicit provider linking and private support recovery workflow.
- Community topics, reactions, comments, first-comment approval, reports and admin moderation.
- Military-specific editing, content schema, readiness reports and delivery to the game.
- Gameplay selection by unique aircraft family rather than only photo ID, plus card/session mapping.
- Final photography permission checks before a public launch.

The sign-in layout checkpoint addresses the public page and safe homepage/action redirects.
It does not claim the remaining features above are available.
