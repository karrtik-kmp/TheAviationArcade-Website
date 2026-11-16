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

## Done when

The Admin repo names `airplane-games-9fe1e` everywhere except the D1 export, and its `firebase.json` domains match the
website's. Tests pass and the 3 commits are pushed. A3 is planned against §2.
