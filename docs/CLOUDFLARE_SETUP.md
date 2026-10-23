# Direct Cloudflare deployment — 2026-10-23

The user chose Cloudflare hosting first and asked that the Vercel setup be saved separately.
Vercel bootstrap commit `590a271` is on `codex/vercel-setup`; it is intentionally not merged here.
This branch is `codex/cloudflare-prototype`. No remote Git push was performed.

## Verified runtime checkpoint

The Bunny integration is committed as `8ea2c22`; default deployment tooling is `55bf91b`.
TypeScript, focused ESLint, the production build, deploy-wrapper dry run and
bare Wrangler default dry run passed at that checkpoint. The subsequent protected-host
configuration passes all 32 unit tests, focused ESLint and a generated-target Wrangler dry run.
The live Bunny connection check also
passed: one random probe was uploaded, downloaded with identical bytes, and deleted.
No existing photos were changed. The user confirmed that both Access and the website's
Firebase sign-in worked at the live URL. Full upload/editorial browser regression on this
host has not been automated; its workflow evidence remains the earlier local suite.

## Current account and database

- The Cloudflare connection was reauthorized. Its sole current account is
  `049215df8c62c566983633f79093452c`, with subdomain `karrtik-kmphitech.workers.dev`.
  Earlier discovery of account `1c8505799632eed02e8a11f3b998aa69` is superseded.
- D1 database `aviation-arcade-website` was created in Western Europe:
  `c76cdebd-08b5-46a5-8045-912abec78511`. After confirming it had no user tables,
  the initial checked-in schema was applied; all three tables were verified.
- No existing photos, private records or demo data were copied into the new database.
- Worker `aviation-arcade-website` has been uploaded with the real D1 binding, production
  Firebase settings, Bunny metadata and encrypted `BUNNY_STORAGE_PASSWORD` / `STAFF_EMAILS`.
  The deployed binding list has no R2 binding and no Firebase Auth emulator binding.
- `npm run deploy` completed at checkpoint `55bf91b`. The later staff-secret correction
  created deployment `9b99864e-c961-4d62-86d0-536bdefe6966`, version
  `3685f364-23a2-45b2-8e1f-8ea8b60cc21b` at 100%, created at `2026-10-23T05:09:22.931789Z`.
  This supersedes the earlier direct uploads; application code is still checkpoint `55bf91b`.
- The protected `workers.dev` hostname is enabled; preview URLs remain disabled.
  The Worker has no custom domains. No product domain or R2 bucket was created.

The direct [private prototype](https://aviation-arcade-website.karrtik-kmphitech.workers.dev)
is reachable through Cloudflare Access. The original owner-private Sites deployment remains
available. Firebase product login and staff permissions remain separate from the Access gate.

## Bunny storage selected

The user selected Bunny and supplied zone `aviation-arcade-website`, region `de`
(Frankfurt, Germany), S3 endpoint `https://de-s3.storage.bunnycdn.com`.
The live connection check authenticated these settings successfully. No Bunny zone or account
balance was changed by the agent; the temporary probe was removed.

The server now has an opt-in Bunny S3 adapter for signed PUT/GET/DELETE requests, payload hashing,
streamed reads, timeouts and safe errors. Existing API authorization, validation, revisions and
retry handling still apply. Default R2 storage remains available for the managed Site/local emulator.
The direct deployment selects Bunny and omits R2 bindings. See [Bunny setup](BUNNY_STORAGE_SETUP.md)
and `.dev.vars.cloudflare.example` for private settings. Passwords belong only in ignored local
settings and Worker secrets, never client code or Git.

## Firebase host authorization

The exact Worker hostname was added to project `airplane-games-auth-20261022` through
the authenticated Firebase CLI's Auth configuration API. The operation read the live domains
first and preserved every existing entry. `firebase.json` records the hostname locally.
The user confirmed successful live Firebase sign-in after passing Access. Verification/reset
email delivery and every provider variant have not been separately checked.

## Private Access enabled

The user explicitly approved the proposed organization, application, reviewer policy and enabling
the protected hostname. The prior local staff setting was a reserved test address; the user
selected a real receiving email for both Access and product staff. The ignored deployment env,
generated secrets file and deployed `STAFF_EMAILS` secret now contain that selection.

- Organization: `Airplane Games prototype`, domain `misty-mud-b554.cloudflareaccess.com`.
- Application: `Airplane Games prototype review`, ID `77c80c6f-1612-4726-bb7e-4c354202ac57`,
  restricted to the exact Worker hostname above.
- Login: email verification code, IdP `c1da79a5-13a3-4b93-b0da-201ec568138e`;
  a 24-hour session and HTTP-only cookie.
- Reusable policy: `Prototype reviewers`, ID `605b8157-ec0c-41ed-bd33-6567050c29e5`,
  allowing only the user-selected real email. Product staff verification still applies separately.
- Preview URLs are disabled; unrelated applications and policies were not changed.

Application/policy read-back matched before enabling the hostname. Six unauthenticated routes
(homepage, admin, contributor portal, API, account and asset path) returned 302 redirects to
the Access organization. The email form returned HTTP 200 with the expected application name.
The user then confirmed both sign-ins worked. See
[credential-free smoke evidence](evidence/cloudflare-access-smoke.json).

`config/cloudflare-prototype.json` records `workersDev: true` and the Access app/host metadata.
Preparation defaults the flag to false if absent and always disables previews. The flag controls
routing; it does not create or verify an Access policy. Keep the approved Access app intact.
To withdraw the direct host, disable `workers.dev` remotely and set the source flag to false.

## Cloudflare agent environment

The user requested the [official agent setup](https://developers.cloudflare.com/agent-setup/prompt.md).
All 19 skills from `cloudflare/skills` were installed globally for Codex in
`C:/Users/PC/.agents/skills`. The skills CLI recognizes them as Codex skills.
The official `https://mcp.cloudflare.com/mcp` server was registered in
`C:/Users/PC/.codex/config.toml` and OAuth login succeeded. Its live identity and account read
confirmed the intended Karrtik account. Existing Codex settings, including Unity MCP, were preserved
(the CLI normalized an empty Node REPL argument list). The config backup stays in the private
Codex configuration directory, outside this repository.

The user chose to keep Wrangler rather than install the optional beta `cf` CLI. New skills are
available on a subsequent turn; restart Codex to fully reload the agent environment if needed.

## Next deployment steps

1. For further live QA, exercise uploads, contributor isolation, revisions and editorial workflows
   at the protected URL. Record passes, failures and human-only checks honestly.
2. For later uploads, run `npm run build` and `npm run cloudflare:prepare` to generate an ignored direct Wrangler
   configuration using the real account/database and Bunny metadata. The source target preserves
   the approved protected hostname; previews stay disabled. Do not deploy the Sites placeholder config.
   Use `--config outputs/cloudflare-deploy/wrangler.json` and
   `--secrets-file outputs/cloudflare-secrets.json` with Wrangler. Wrangler is authenticated;
   no new login is required unless the stored authorization expires.
3. The D1 schema is already initialized. Do not reapply the initial schema or import demo data.

## Default build and deploy commands

For this portable Cloudflare checkout, use:

```powershell
npm run deploy -- --dry-run
npm run deploy
```

The deploy command requires the Bunny password and staff allowlist before starting, rebuilds,
prepares the Bunny target and supplies the ignored secrets file to the project-local Wrangler.
Only `--dry-run` is accepted as a command override. It preserves the source target's approved
protected hostname and keeps preview URLs disabled.

Portable `npm run build` waits for Vinext to finish, then prepares Bunny configuration and updates
`.wrangler/deploy/config.json`. This prevents a bare Wrangler deploy from falling back to the
framework's original `site-creator-r2` binding. A portable build now needs production Firebase
Web configuration in `.dev.vars.cloudflare` or ignored `outputs/firebase-web-config.json`.
Do not hand-edit generated output. The managed Linux Site build retains its own path;
`npm run start` still selects the local emulator config explicitly.

The parallel default-deployment task completed and committed its five owned files as `55bf91b`.
The current five deployment regressions cover absent/explicit Worker route options, generated
config selection, build completion, explicit config/secrets arguments and refusal to upload
after invalid input or a failed build. Final bindings and URL flags were verified through the API.

References: [Bunny S3 setup](https://bunny.net/docs/storage/s3),
[Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/),
[Cloudflare agent setup](https://developers.cloudflare.com/agent-setup/prompt.md).
