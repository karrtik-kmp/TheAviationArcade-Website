# Intent: dev sites for Josh's demo (hosting I-4 … I-7)

**Confirmed:** 2026-11-16 by the user, in an interview with the website session.
**Locks:** I-4 … I-7 of [`../INTEGRATION_SCENARIOS.md`](../INTEGRATION_SCENARIOS.md) §2 (I-1 … I-3 were locked 11-13),
plus a new ruling on the Firebase project.

## Statement of intent

| | |
|---|---|
| **Outcome** | `dev.playairplanegames.com` and `dev.admin.playairplanegames.com` run on our server against the dev backend, with no D1, showing Josh his real content |
| **User** | Josh (concept owner), for the demo. The user is the admin who approves and publishes |
| **Why now** | Cloudflare is being dropped, and the Firebase account changed, so sign-in has to be set up again anyway |
| **Success** | Josh sees his 31 Military rows, Aircraft Identifier items and a scheduled Plane of the Day, published by the user through the Admin. Real photographers sign in on `dev.` with email or Google and hold the photographer role. ⚠️ Found 11-16: Josh has delivered no Aircraft Identifier photos and no Plane of the Day content (root `docs/content-sources.md`), so only the Military desk can be filled from his files. Where the other two come from is open; never made-up content |
| **Constraint** | Only client-supplied content. Roles are tied to a Firebase account (project + UID), never matched by email. D1 is deleted only after the demo works, with the user's yes at that point |
| **Out of scope** | Prod sites and the public launch, moving the old D1 proposals, fixing the shared-IP rate limit (I-6), and game delivery of Military releases |

## Decisions locked

- **I-4 (old D1 proposals):** they are mostly test uploads, so nothing is migrated. Export D1 read-only to a local
  backup file first. Delete the Cloudflare D1 database once the dev demo works, with the user's explicit yes at
  that point (scenario E3). E2's migration rehearsal is dropped.
- **I-5 (desk records):** a Backend script loads the desks from Josh's own files (`Military Airplane Identifier
  v1.xlsx` and its pictures, plus the other client deliveries). Josh's photos are uploaded under the staff
  photographer account (WC-3). The same script gives the photographer role to the real photographers by Firebase
  UID, after each has signed up on `dev.` themselves. Names and UIDs are supplied later. The user approves and
  publishes in the Admin, and schedules one Plane of the Day. Records are recreated, not migrated (WC-2). The script
  lives in `Backend/` and goes to that session as a brief.
- **I-6 (guest traffic):** for the dev sites, it's fine that every visitor shares one IP toward the backend's public
  rate limit. It must be fixed before the public apex launches (a trusted website key, or caching the public read).
- **I-7 (user-only steps):** the user points the `dev` DNS record at the server now, so propagation and the
  certificate don't hold up the deploy. Before the dev deploy, on `airplane-games-9fe1e`, the user adds the
  dev hosts to Firebase's authorized domains, turns on Google sign-in, and makes themself the first admin with
  `roles:grant` on the dev backend. Google sign-in on each host is then checked by a person (B2).

## New ruling: Firebase project

`airplane-games-9fe1e` ("Airplane Games", under the new Google account) replaces `airplane-games-auth-20261022`
**everywhere**: website, Admin, Backend and the game, dev and prod. The old project is retired.

Consequences:

- Every existing account and `account_roles` row is tied to the old project and does not carry over. Everyone signs
  up again (this already fits I-5).
- The website and Admin get the new Firebase web config. `firebase.json` `authorizedDomains` lists the new hosts.
- The Backend verifies ID tokens for the new project ID: brief to the Backend session.
- If the game signs in with Firebase, Unity v2 changes too: brief to the Unity session.
- The rule "Cloud project is `airplane-games-auth-20261022`" in the root `CLAUDE.md`, `website/AGENTS.md` and the
  Admin's rule sheet must be updated.
- Local tests stay on the `demo-airplane-games` emulator.
