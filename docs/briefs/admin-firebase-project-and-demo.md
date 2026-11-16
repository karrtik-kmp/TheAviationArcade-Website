# Brief to the Admin: new Firebase project, and what the dev demo needs from the desks

**From:** the website session, 2026-11-16 · **To:** the Admin session (`H:\Work\TheAviationArcade\Admin`) ·
**Rulings:** user, 2026-11-16, full text in website [`docs/intent/hosting-dev-demo.md`](../intent/hosting-dev-demo.md).
Edit only the Admin repo. The Admin repo's `main` has 3 commits that aren't pushed yet (`fad55cc`, `37be738`,
`a129b27`); push them per the user's push-after-every-round rule.

## 1. Firebase project: `airplane-games-9fe1e`

It replaces the retired `airplane-games-auth-20261022` everywhere. Mirror what the website changed in `94670ad`,
since the shared modules and config are copies:

| File | Change (as in the website) |
|---|---|
| `AGENTS.md` line 18 | Cloud project is `airplane-games-9fe1e` (ruling 11-16); the old one is retired and its accounts don't carry over |
| `.firebaserc` | `default` → `airplane-games-9fe1e` |
| `firebase.json` `authorizedDomains` | `localhost`, `127.0.0.1`, `dev.playairplanegames.com`, `dev.admin.playairplanegames.com`. **Keep the list identical in both repos**, since either repo's provisioning writes the project's one list |
| `web.env.example` lines 25–28 | project id and `airplane-games-9fe1e.firebaseapp.com` |
| `docs/FIREBASE_SETUP.md`, `docs/BACKEND_SYNC_PLAN.md` | Note the new project; the old provisioning paragraph is history |

**Leave alone:** `scripts/media-export/bundle.mjs` `REMOTE_PROJECT` (and its test) and `MEDIA_PLAN.md` line 219. The D1
export reads owners who signed in through the old project, so it must keep naming it. Cloudflare-era docs
(`CLOUDFLARE_SETUP.md`, `DEMO_PREVIEW.md`, `.dev.vars.cloudflare.example`) are history.

## 2. What the dev demo needs from the Admin

- **Who it's for:** Josh. The user is the admin who approves and publishes.
- **Content:** a Backend seed script (brief `backend-firebase-project-and-demo-seed.md`, next to this file) fills the
  Military desk from Josh's sheet (31 rows, `mil-a1`…`mil-a31`). Photos land as drafts under the staff photographer
  account. Nothing is published by the script.
- **So A3 must give the user, on `dev.admin.`:**
  - the Military desk listing the 31 rows
  - moving items through the stages
  - publishing photos in the Media desk
  - a Military release
  - Plane of the Day scheduling, and Aircraft Identifier drafts and publishing
  - all on the backend, with the 409 → reload rule kept
- **D1:** nothing is migrated (I-4). The user exports D1 to a backup, and D1 is deleted after the demo works. So the
  desks' D1 code can go with A3, without keeping a reader for old records. Keep `npm run media:export` until the
  backup exists.
- **Aircraft Identifier and Plane of the Day (for now):** the seed also loads Josh's 2026-09-28 delivery. That's 31
  Identifier questions with photos (the same set as the game), and 5 Plane of the Day entries (`pod-4`…`pod-8`, credit
  Josh M) for the user to publish and schedule. The full 241-question sheet comes later. Never fill a desk with made-up
  content.

## 3. What the Backend built (2026-11-16, Backend `main` up to `89a0740`)

This comes from the Backend's hand-over note. Plan it into A3:

- **Aircraft Identifier lives in the content module `identifier`, not in editorial items.** The Identifier desk reads
  `GET /v1/admin/content/identifier/items` (API 0.27.0, the same shape as Military) to show the 31 questions. Vendor
  the contract at 0.27.0 or later.
- **Order of work for Plane of the Day:** a Plane of the Day draft can only use a published photo, so the seed
  uploads the 5 photos as drafts. The user publishes each photo in the Media desk, then a second seed run creates the
  5 Plane of the Day drafts, and the user publishes and schedules one. The desk's empty state should say this.
- **Licence and source waiver, dev only** (user, 2026-11-16; Backend plan `docs/plans/dev-licence-waiver.md`,
  in review, not built yet):
  - On a `_dev` database, a photo can be published with no licence. The version records `licenceWaiver: "dev-demo"`.
  - The Plane of the Day factual source is waived the same way.
  - The Media desk and Plane of the Day desk show this as "Published without a licence (dev demo)" and "No source
    (dev demo)". Never show a licence name that isn't there.
- **Credit:** 4 Military rows (sheet rows 17, 26, 28, 29) give no photographer. On dev, the user ruled "No credit on
  dev". Under the same switch, the seed sets "credit required" off for those 4 photos only, never writes a name, and
  the audit records `creditWaived: "dev-demo"`. Elsewhere, credit stays required, and the desk shows the reason when
  it blocks publishing.
- **How the waiver is visible: there is no new API field.** The Admin parses `MediaVersion`/`MediaLicence` strictly,
  and the contract has `additionalProperties: false`. The waiver lives in two places:
  - **Database:** the column `media_versions.licence_waiver = 'dev-demo'`. A Plane of the Day item keeps
    `factualSource: ""`.
  - **Audit:** `media_publish` detail `licenceWaived: "dev-demo"`, and `editorial_save` detail
    `factualSourceWaived: "dev-demo"`. The audit desk (W4) can show these.

  The desks can also infer the labels without anything new: a published version with `licenceName: null` reads
  "Published without a licence (dev demo)", and a live Plane of the Day item with an empty `factualSource` reads
  "No source (dev demo)". If you want an explicit field, ask the Backend; it adds one once your parser accepts it.
- **API 0.27.1** changes descriptions only: a published `ImageRef` or Plane of the Day feature may now carry
  `licenceName: null`.
- **The Admin's own pre-checks block the waivers in the browser:** `lib/media-form.ts:278` ("Add a licence name.") and
  `lib/rules.ts:172` ("Add an https factual source."). They need a dev-only switch on the Admin too, keyed to the
  same `DEV_DEMO_WAIVER=dev-demo` in the dev Admin's env file and refused on the prod Admin. That switch only relaxes
  the browser check; the Backend stays the authority and still refuses when its own switch is off.
- **Shared photos:** `ai-a11`/`ai-a11-2` and `ai-a18`/`ai-a18-2` each share one photo, so the two questions in a pair
  can't be in the same release. If the Identifier release desk is built, it shows this as a refusal reason.

## Done when

The Admin repo names `airplane-games-9fe1e` everywhere except the D1 export, and its `firebase.json` domains match the
website's. Tests pass and the 3 commits are pushed. A3 is planned against §2.
