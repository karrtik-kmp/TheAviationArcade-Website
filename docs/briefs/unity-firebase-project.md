# Brief to Unity v2: the Firebase project changed to `airplane-games-9fe1e`

**From:** the website session, 2026-11-16 · **To:** the Unity v2 session (`C:\Unity\Projects\AviationArcade_v2`) ·
**Ruling:** user, 2026-11-16: `airplane-games-9fe1e` replaces `airplane-games-auth-20261022` everywhere (website,
Admin, Backend, game; dev and prod). The old project is retired with the Google account that owned it. See root
`docs/PROJECT_STATE.md` §3 (11-16 row). Edit only the Unity repo.

## What it means for the game

- Every account in the old project is gone for the game too: test players sign up again. Server progress keyed to old
  principals (`firebase:airplane-games-auth-20261022:<uid>`) is unreachable. It is never re-keyed by email.
- The backend will accept only ID tokens from `airplane-games-9fe1e` (Backend brief, same day).

## Files that name the old project (found 11-16)

| File | What to do |
|---|---|
| `Assets/google-services.json` | Replace with the file from the Android app registered in `airplane-games-9fe1e` (same package name) |
| `Assets/GoogleService-Info.plist` | Replace with the file from the iOS app in the new project (same bundle id) |
| `Assets/Plugins/Android/FirebaseApp.androidlib/res/values/google-services.xml` | Generated from `google-services.json`; regenerate it, don't hand-edit |
| `Assets/StreamingAssets/google-services-desktop.json` | Generated for the Editor/desktop; regenerate it |
| `Assets/_Project/Scripts/Composition/AppCompositionRoot.cs` line 428 | The comment names the old issuer; update it to `https://securetoken.google.com/airplane-games-9fe1e` |
| `docs/architecture/ADR-0006-account-identity.md`, `docs/implementation/IMPLEMENTATION_STATUS.md` | Note the new project (ADR: an amendment line, not a rewrite) |

## Steps that need the user (console)

1. In Firebase `airplane-games-9fe1e`: register the Android and iOS apps with the game's existing package and bundle
   ids, and download the two config files. Turn on email/password (and Google for Android, per ADR-0006). Add the
   Android signing SHA-1/SHA-256 fingerprints, or Google sign-in fails on device.
2. In the UGS dashboard, change the `oidc-firebase` provider's Client ID and issuer to the new project (root
   `docs/ugs-setup.md`, flagged ⚠️). The Backend re-runs `ugs:check --live`.

## Client questions to log (you own `docs/implementation/CLIENT_CONTENT_IMPORT.md`)

The Aircraft Identifier Google Sheet (241 questions) was checked on 2026-11-16. Root `docs/content-sources.md` lists
the details. Please log these as client questions:

1. **Photos:** please send the photos as files, or tell us which photo goes with each row. Rows 37–244 have no file
   name; `ai-a23/jpg` on row 28 looks like a typo.
2. **Licence and credit** for those photos.
3. **Wrong answers that repeat** the correct answer or each other: rows 11, 18, 71, 95, and two more (listed in
   `content-sources.md`).
4. **Spelling** in answers: "Boing", "Bowing", "Aribus", "A321cep", and others.
5. **Shared photos:** may two questions share one photo? (rows 14/15, 22/23, 64/65)

## Done when

- The game signs in on device against `airplane-games-9fe1e`.
- The UGS sign-in through `oidc-firebase` works with the new token. This was never proven from the game even on the
  old project, so say plainly whether it was proven now.
- No asset or script names `airplane-games-auth-20261022`.
