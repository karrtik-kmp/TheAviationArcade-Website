# Firebase Authentication setup

Firebase Authentication is the product account provider for contributors and staff.
The outer private Sites access gate remains separate. Product content routes use
Firebase identity and do not authorize requests from hosting headers.

Provisioned on 2026-10-22: project `airplane-games-auth-20261022`, Web App
`1:657564884414:web:0aa58e8e36a6aa83f2adef` (`Airplane Games Website`). Auth configuration
deployment succeeded with email/password and Google enabled. The four production
Web SDK bindings and staff allowlist are configured through the Site's runtime
environment. No Firebase Hosting deployment or product domain change was performed.

The provisioner configures only these Firebase sign-in methods:

- Email and password
- Google

The checked-in [firebase.json](../firebase.json) remains the source for the Auth authorized domains and provider settings. The provisioner creates a generated deployment copy with the active owner's support email; it does not rewrite `firebase.json` or local `.dev.vars`.

## Requirements

- Node.js **22.13 or newer**, matching this website's `engines` requirement.
- A Google account authorized to create or administer the Firebase project. For an existing project, the account must have the project role needed to configure Auth and create/list Web Apps.
- Firebase CLI access through `node scripts/firebase-cli.mjs`. The wrapper invokes the current `firebase-tools@latest` using Node and npm's `npx-cli.js`; the local command help was checked with Firebase CLI **15.34.1**. Check the version resolved by the wrapper with:

  ```powershell
  node scripts/firebase-cli.mjs --version
  ```

The wrapper uses `.sites-runtime/firebase-cli-cache` as its npm cache by default, avoiding a damaged or incompatible global npm cache. `FIREBASE_NPX_PATH` can point to a different `npx-cli.js`, and `FIREBASE_NPM_CACHE` can select a different cache directory.

## Create or reuse the project and configure Auth

Run the login command in a local terminal. If the CLI displays an authorization code, enter it in the CLI/browser flow locally; do not put it in chat, a source file, or an output file.

```powershell
node scripts/firebase-cli.mjs login --no-localhost
node scripts/firebase-cli.mjs login:list
```

Then run the provisioner with the exact, non-demo project ID you intend to own. Omitting `--support-email` uses the active account at the top of `firebase login:list --json`; supplying it requires an email that matches that active CLI account.

```powershell
node scripts/provision-firebase.mjs --project-id airplane-games-auth-20261022
# Or explicitly:
node scripts/provision-firebase.mjs --project-id airplane-games-auth-20261022 --support-email owner@example.com
```

The script checks the exact project ID in `firebase projects:list --json`. It reuses that ID when visible to the logged-in account, otherwise asks Firebase to create that exact project with display name `Airplane Games`, then confirms the same ID is visible. It preserves other `.firebaserc` keys and writes `projects.default` only after project creation or reuse succeeds.

The script lists Web Apps for that project. It reuses an app named `Airplane Games Website`, or a sole existing Web App; with no Web Apps, it creates one. If the Firebase CLI asks whether to create a Firebase Hosting site during Web App creation, choose **No**. Hosting is outside this setup.

It writes two ignored local files under `outputs/`:

- `firebase-web-config.json` contains the Firebase Web App's public client settings and the runtime binding names.
- `firebase-provision.json` contains a copy of the existing Firebase config with `supportEmail` set under Google sign-in. It retains the authorized domains from `firebase.json` and enables only email/password and Google.

Finally, it deploys only Auth configuration with `firebase deploy --only auth --project <exact-id> --config outputs/firebase-provision.json`. It does not deploy Hosting, rules, functions, or any other service. Review the generated config and the CLI's final response before treating Auth as provisioned.

Copy the four `runtimeBindings` values from `outputs/firebase-web-config.json` into the production runtime's normal configuration workflow:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_WEB_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_APP_ID`

These are Web SDK client settings, not service-account credentials. Do not put Firebase refresh tokens, CLI credentials, private keys, or service-account JSON in either output. Leave `FIREBASE_AUTH_EMULATOR_HOST` unset in production. The provisioner does not edit Cloudflare/Sites variables or secrets.

## Local Auth Emulator

Use the literal demo project ID `demo-airplane-games`. The Auth emulator is fixed in [firebase.json](../firebase.json) to `127.0.0.1:9099`. Firebase demo project IDs have no live resources; with a `demo-` project, SDK calls should go only to configured emulators.

In a terminal, start only Auth:

```powershell
node scripts/firebase-cli.mjs emulators:start --only auth --project demo-airplane-games
```

In the ignored `.dev.vars` file, merge these local-only bindings with existing content. Preserve other local variables; do not replace the file. The API key and app ID below are emulator placeholders, not production settings.

```dotenv
FIREBASE_PROJECT_ID=demo-airplane-games
FIREBASE_WEB_API_KEY=fake-api-key
FIREBASE_AUTH_DOMAIN=demo-airplane-games.firebaseapp.com
FIREBASE_APP_ID=1:123:web:demo
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
```

In another terminal, run the site on a loopback URL:

```powershell
npm run dev
```

The server enables the emulator only in a development build, when the request host is loopback, the project ID starts with `demo-`, and the emulator host is a loopback host plus port. An invalid emulator setting fails closed; it does not silently redirect auth to the production Firebase service. Do not use these demo values on a deployed host.

Run `npm run demo:seed` after starting the emulator for the three local accounts
listed in README.md. The emulator's Google and email actions are simulated;
successful local checks do not prove live OAuth consent or email delivery.

## References

- [Firebase CLI reference](https://firebase.google.com/docs/cli) — project, Web App, JSON output, and `deploy --only auth` commands.
- [Firebase Auth emulator connection guide](https://firebase.google.com/docs/emulator-suite/connect_auth) — demo projects and Web SDK emulator connection.
- [Firebase Web setup](https://firebase.google.com/docs/web/setup) — Web App configuration values.
