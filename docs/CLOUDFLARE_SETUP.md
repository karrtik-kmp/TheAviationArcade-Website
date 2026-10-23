# Direct Cloudflare deployment preparation — 2026-10-23

The user chose Cloudflare hosting first and asked that the Vercel setup be saved separately.
Vercel bootstrap commit `590a271` is on `codex/vercel-setup`; it is intentionally not merged here.
This branch is `codex/cloudflare-prototype`. No remote Git push was performed.

## Verified baseline

The original Workers/Vinext source is retained. TypeScript passed, all 20 unit tests passed,
and the five-stage production build completed successfully on 2026-10-23.
This does not establish a new live deployment, provider login, or browser regression result.

## Current account and database

- The Cloudflare connection was reauthorized. Its sole current account is
  `049215df8c62c566983633f79093452c`, with subdomain `karrtik-kmphitech.workers.dev`.
  Earlier discovery of account `1c8505799632eed02e8a11f3b998aa69` is superseded.
- D1 database `aviation-arcade-website` was created in Western Europe:
  `c76cdebd-08b5-46a5-8045-912abec78511`. After confirming it had no user tables,
  the initial checked-in schema was applied; all three tables were verified.
- No existing photos, private records or demo data were copied into the new database.
- No Worker, public URL, product domain, R2 bucket or Access policy was created.
  The earlier account's Access/R2 activation state does not establish this account's state.

The existing owner-private Sites deployment remains the deployed reference. A direct deployment
must preserve the review audience with an explicitly configured outer access gate; Firebase product
login and staff permissions are separate. Do not publish the entire prototype publicly by accident.

## Bunny storage selected

The user selected Bunny and supplied zone `aviation-arcade-website`, region `de`
(Frankfurt, Germany), S3 endpoint `https://de-s3.storage.bunnycdn.com`.
The zone must have been created with S3 compatibility enabled. Its supplied details
have not yet been authenticated against Bunny. No Bunny zone or account balance was changed.

The server now has an opt-in Bunny S3 adapter for signed PUT/GET/DELETE requests, payload hashing,
streamed reads, timeouts and safe errors. Existing API authorization, validation, revisions and
retry handling still apply. Default R2 storage remains available for the managed Site/local emulator.
The direct deployment selects Bunny and omits R2 bindings. See [Bunny setup](BUNNY_STORAGE_SETUP.md)
and `.dev.vars.cloudflare.example` for private settings. Passwords belong only in ignored local
settings and Worker secrets, never client code or Git.

Bunny has a $1 monthly minimum per account with active zones; it is not a permanent free tier.
R2 includes 10 GB-month Standard storage free but requires an activated subscription.
Supabase Free includes 1 GB file storage and 50 MB uploads, with inactivity pausing.
Recheck provider pricing when resuming.

## Next deployment steps

1. Fill the read-write Bunny zone password and staff emails in ignored `.dev.vars.cloudflare`.
2. Run `npm run bunny:check`: one random probe upload, exact-byte read and deletion.
3. The new D1 database and schema are ready. Do not reapply the initial schema.
4. Run `npm run build` and `npm run cloudflare:prepare` to generate an ignored direct Wrangler
   configuration using the real account/database and Bunny metadata. `workers_dev` and
   `preview_urls` remain disabled. Do not deploy the original Sites placeholder config.
5. Configure production Firebase bindings from ignored `outputs/firebase-web-config.json`,
   verify the staff allowlist, keep emulator settings out, and authorize the final host in Firebase.
6. Configure the outer private review gate before making a direct host reachable.
7. The local Wrangler CLI still needs authentication to the intended account. Dry-run, deploy
   with the generated secrets file, and verify accounts, uploads, contributor isolation, revisions
   and editorial workflows at the actual protected URL. Record the deployment and source commit.

References: [R2 setup](https://developers.cloudflare.com/r2/get-started/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[Supabase pricing](https://supabase.com/pricing),
[Bunny Storage pricing](https://bunny.net/pricing/storage/),
[Bunny billing FAQ](https://bunny.net/faq/).

Integration checks: TypeScript, adapter tests, the production build and a direct Wrangler
deployment dry run pass. No live Bunny connection or new browser/provider-login result is claimed.
