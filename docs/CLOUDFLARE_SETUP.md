# Direct Cloudflare deployment — 2026-10-23

The user chose Cloudflare hosting first and asked that the Vercel setup be saved separately.
Vercel bootstrap commit `590a271` is on `codex/vercel-setup`; it is intentionally not merged here.
This branch is `codex/cloudflare-prototype`. No remote Git push was performed.

## Verified runtime checkpoint

The Bunny integration is committed as `8ea2c22`; default deployment tooling is `55bf91b`.
TypeScript, all 31 unit tests, focused ESLint, the production build, deploy-wrapper dry run and
bare Wrangler default dry run passed. The live Bunny connection check also
passed: one random probe was uploaded, downloaded with identical bytes, and deleted.
No existing photos were changed. These checks do not establish live Firebase provider flows
or browser/editorial workflows on the new host.

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
- The final `npm run deploy` completed. The Cloudflare API reports deployment
  `e909b48b-3a83-42da-8ed1-f28c41adb925` with version
  `b221e051-ae3c-4fbe-853a-754767c56ff5` at 100%, created at `2026-10-23T05:00:26.513191Z`.
  This supersedes the earlier direct uploads. The deployed runtime/build checkpoint is `55bf91b`.
- `workers.dev` and preview URLs are both disabled, and the Worker has no custom domains.
  Its planned hostname is `aviation-arcade-website.karrtik-kmphitech.workers.dev`.
  No product domain, R2 bucket or Access policy was created.

The existing owner-private Sites deployment remains the reachable reference. The direct Worker
must preserve the review audience with an outer access gate before its URL is enabled.
Firebase product login and staff permissions remain separate from that gate.

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

The exact planned Worker hostname was added to project `airplane-games-auth-20261022` through
the authenticated Firebase CLI's Auth configuration API. The operation read the live domains
first and preserved every existing entry. `firebase.json` records the hostname locally.
Real Google consent, verification/reset email delivery and staff sign-in still need a live check.

## Private Access approval required

This account's Access organization and application reads returned `access.api.error.not_enabled`.
Automatic approval review rejected creating an Access organization because that is a persistent
security-boundary change requiring explicit user authorization. Do not bypass that rejection,
create a substitute gate, or enable the Worker URL before the required approval.

A concrete proposal is saved privately in ignored `outputs/cloudflare-deploy/access-proposal.json`:

- Organization: `Airplane Games prototype` in the account above.
- Application: `Airplane Games prototype review`, restricted to the exact planned hostname.
- Login: email verification code; a 24-hour session and HTTP-only cookie.
- Policy: `Prototype reviewers`, allowing only the emails currently listed in the local
  `STAFF_EMAILS` setting. Product staff verification still applies inside the website.
- Keep all unrelated applications/policies intact and keep preview URLs disabled.

Explicit approval for this proposal is still pending. After approval, create and verify the
exact-host Access application and allowlist before enabling `workers.dev`. Verify that an
unauthenticated visitor reaches the Access gate, then run the protected app's browser workflows.

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

1. Obtain explicit approval for the Access proposal above, then configure and verify the gate.
2. Enable only the protected Worker hostname; retain disabled preview URLs.
3. Verify real Firebase sign-in, uploads, contributor isolation, revisions and editorial workflows
   at the protected URL. Record passes, failures and human-only checks honestly.
4. For later uploads, run `npm run build` and `npm run cloudflare:prepare` to generate an ignored direct Wrangler
   configuration using the real account/database and Bunny metadata. `workers_dev` and
   `preview_urls` remain disabled by default. Do not deploy the original Sites placeholder config.
   Use `--config outputs/cloudflare-deploy/wrangler.json` and
   `--secrets-file outputs/cloudflare-secrets.json` with Wrangler. Wrangler is authenticated;
   no new login is required unless the stored authorization expires.
5. The D1 schema is already initialized. Do not reapply the initial schema or import demo data.

## Default build and deploy commands

For this portable Cloudflare checkout, use:

```powershell
npm run deploy -- --dry-run
npm run deploy
```

The deploy command requires the Bunny password and staff allowlist before starting, rebuilds,
prepares the Bunny target and supplies the ignored secrets file to the project-local Wrangler.
Only `--dry-run` is accepted as a command override. It keeps the direct and preview URLs disabled.

Portable `npm run build` waits for Vinext to finish, then prepares Bunny configuration and updates
`.wrangler/deploy/config.json`. This prevents a bare Wrangler deploy from falling back to the
framework's original `site-creator-r2` binding. A portable build now needs production Firebase
Web configuration in `.dev.vars.cloudflare` or ignored `outputs/firebase-web-config.json`.
Do not hand-edit generated output. The managed Linux Site build retains its own path;
`npm run start` still selects the local emulator config explicitly.

The parallel default-deployment task completed and committed its five owned files as `55bf91b`.
The checks above include four regressions for generated config selection, build completion,
explicit config/secrets arguments and refusal to upload after invalid input or a failed build.
Its final upload and private URL flags were verified through the Cloudflare API.

References: [Bunny S3 setup](https://bunny.net/docs/storage/s3),
[Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/),
[Cloudflare agent setup](https://developers.cloudflare.com/agent-setup/prompt.md).
