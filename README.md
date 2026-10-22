# Airplane Games — website and admin

The standalone website repository is **`H:\Work\TheAviationArcade\website`**.
Run every command below from this directory. It contains the branded homepage, seven-game catalog,
photographer submissions and admin tools for Aircraft Identifier and Plane of the Day.

Product login uses **Firebase email/password and Google only**. Account controls include My account,
My submissions, staff-only editorial access, email verification, password reset and logout. The
private review host has its own outer access gate; hosting identity does not grant product access.

## First-time local setup

Use Node.js 24 (minimum 22.13). Install the locked dependencies and create local settings:

```powershell
Set-Location 'H:\Work\TheAviationArcade\website'
npm run install:ci
if (!(Test-Path -LiteralPath '.dev.vars')) {
  Copy-Item -LiteralPath '.dev.vars.example' -Destination '.dev.vars'
}
```

Keep `.dev.vars` private. The example connects to the local Firebase Auth Emulator and allows the
local editor `seedy@sites.test`. Preserve other settings if the file already exists.

On a **fresh checkout/local database only**, build once and apply the content schema:

```powershell
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_charming_spitfire.sql
```

Do not replay that SQL against an already-initialized database. Local D1/R2 content lives in the
ignored `.wrangler/state` directory. Firebase Auth is a separate emulator.

## Start the local servers

Keep two terminals open. In **terminal 1**, start authentication:

```powershell
Set-Location 'H:\Work\TheAviationArcade\website'
npm run auth:emulator
```

Wait for `All emulators ready`. In **terminal 2**, seed the local accounts and start the website:

```powershell
Set-Location 'H:\Work\TheAviationArcade\website'
npm run demo:seed
npm run dev
```

Open:

| Destination                 | Local URL                        |
| --------------------------- | -------------------------------- |
| Homepage                    | http://127.0.0.1:5173/           |
| Email / Google sign-in      | http://127.0.0.1:5173/sign-in    |
| Account and logout controls | http://127.0.0.1:5173/account    |
| Photographer portal         | http://127.0.0.1:5173/contribute |
| Editorial workspace         | http://127.0.0.1:5173/admin      |

The Auth Emulator runs at `127.0.0.1:9099`. Demo accounts share the **local-only** password
`LocalPreview-2026!`:

| Email                       | Access                                      |
| --------------------------- | ------------------------------------------- |
| `seedy@sites.test`          | Editor and contributor                      |
| `photographer-a@sites.test` | Contributor                                 |
| `photographer-b@sites.test` | A separate contributor for ownership checks |

The seed command is repeatable and creates verified local accounts. Re-run it after restarting an
empty Auth Emulator. It never connects to a real Firebase project. Google accounts and email links
are simulated by the emulator; verification/reset links appear in terminal 1. These credentials have
no production meaning. Use **Load demo data** in admin for sample editorial content; samples cannot
be published. Old host-owned records are not automatically transferred to Firebase users.

Stop each server with **Ctrl+C** in its terminal. If port 5173 or 9099 is occupied, stop the server
that owns it before restarting. Do not kill unrelated Node processes or the Unity Editor.

### Windows command fallback

If the `npm` launcher fails, call its JavaScript CLI directly, or use the framework runner:

```powershell
node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' run install:ci
node scripts/firebase-cli.mjs emulators:start --only auth --project demo-airplane-games
node scripts/seed-auth-emulator.mjs
node scripts/run-framework.mjs dev
node scripts/run-framework.mjs build
```

`firebase-cli.mjs` reuses your Firebase CLI authorization and invokes `firebase-tools@latest` with
an isolated cache. It does not require a global Firebase installation or store credentials in Git.

## Verification commands

Run the focused source checks:

```powershell
npm run typecheck
npm test
npm run build
```

With both local servers running, execute the browser suites. They use Playwright with installed
Chrome. Point `PLAYWRIGHT_MODULE` at an available Playwright module when it is not installed locally:

```powershell
$env:PLAYWRIGHT_MODULE='file:///C:/Users/PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
npm run test:auth
node scripts/browser-qa.mjs
node scripts/api-qa.mjs
```

The Firebase harness is restricted to loopback/demo services. Browser suites create local fixture
records; they are not cloud tests. Results and screenshots are saved under `docs/evidence`.
The unit suite covers 20 account-path, JWT-validation, submission and editorial cases.
The latest local run passes all eight core workflows and the API retry/layout checks.
Authentication has 13 passes and one skipped Google provider flow: its external helper
script was blocked, and a recoverable error was shown. Local evidence does not prove live Google login.
Historical Lighthouse results predate the Firebase change and are not a new performance measurement.

## Development guidelines

- Keep website/admin changes in this repository. Use the Unity project only as a reference for
  approved branding/content; do not recreate a website directory there.
- Preserve Jost for the wordmark, Barlow Condensed for headings, Poppins for body text, and the
  existing light/dark brand tokens. Check keyboard controls, focus and narrow mobile layouts.
- Use Firebase identity verified by the server. Never grant access from browser-supplied roles,
  names, contact email, hosting headers or local demo credentials. Staff needs a verified email
  present in the server-only `STAFF_EMAILS` allowlist.
- **Callsign is the community player name tag.** It is a public profile attribute, not a password
  or account identifier. Do not create an independent website Callsign registry or claim game
  account linking until the authoritative game contract is integrated.
- Keep contact email, photo credit and account ownership separate. Approval needs all review checks;
  creating/publishing an editorial record is a separate action with source and usage checks.
- Preserve session-generation guards, the account-change request fence and draft base versions.
  Never automatically retry a failed write under a different account.
- Keep `.dev.vars`, credentials, runtime caches, dependencies, builds and publication archives out
  of Git. `.firebaserc` contains only the selected project ID; it is not a credential.
- Make focused commits, inspect staged files, run relevant checks and update `docs/TASKS.md`.
  Use Luna for scoped implementation and 6.1 Sol low/medium for complex planning/review.
- Public links use native anchors through `SiteLink`; this avoids a verified Vinext beta prefetch
  issue. Verify framework behavior before removing that workaround.

## Cloud setup and product boundaries

Firebase project: `airplane-games-auth-20261022`. [Firebase setup and provisioning](docs/FIREBASE_SETUP.md)
records the exact workflow. Runtime configuration uses `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`,
`FIREBASE_AUTH_DOMAIN`, `FIREBASE_APP_ID` and `STAFF_EMAILS`. Keep `FIREBASE_AUTH_EMULATOR_HOST` unset
in production. The deployed app rejects development/unsigned emulator tokens.

The private review website is [here](https://airplane-games-community-prototype.givingstar7.chatgpt.site).
The task board records which source checkpoint is deployed. Preserve its current audience.
Real game-account linking/progress migration, production staff capability roles/MFA, public-launch
upload hardening, final publishing rights and retention/deletion policy remain separate work.
JWT signatures and expiry are checked; immediate Firebase revocation/disabled-user enforcement is
not claimed for an already-issued token. No payments or real game-content delivery are activated.

Further context: [task board](docs/TASKS.md), [account review](docs/AUTH_FLOW_REVIEW.md),
[scope](docs/PROTOTYPE_SCOPE.md), [security review](docs/SECURITY_REVIEW.md), and
[asset provenance](docs/ASSET_PROVENANCE.md).
