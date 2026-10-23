# Direct Cloudflare deployment preparation — 2026-10-23

The user chose Cloudflare hosting first and asked that the Vercel setup be saved separately.
Vercel bootstrap commit `590a271` is on `codex/vercel-setup`; it is intentionally not merged here.
This branch is `codex/cloudflare-prototype`. No remote Git push was performed.

## Verified baseline

The original Workers/Vinext source is retained. TypeScript passed, all 20 unit tests passed,
and the five-stage production build completed successfully on 2026-10-23.
This does not establish a new live deployment, provider login, or browser regression result.

## Account discovery

- Cloudflare account: `1c8505799632eed02e8a11f3b998aa69`.
- Workers subdomain: `service-1c8.workers.dev`.
- The account's D1 list was empty. No database has been created or schema applied.
- R2 listing returned Cloudflare error 10042: R2 must be enabled in the dashboard.
- Cloudflare Access listing returned `access.api.error.not_enabled`.
- No Worker, public URL, product domain, R2 bucket or Access policy was created.

The existing owner-private Sites deployment remains the deployed reference. A direct deployment
must preserve the review audience with an explicitly configured outer access gate; Firebase product
login and staff permissions are separate. Do not publish the entire prototype publicly by accident.

## Storage decision pending

The user asked about free alternatives to R2, then supplied `https://dash.bunny.net/storage/add`.
Supabase Free was discussed; it was not selected or provisioned. Bunny is a candidate, not yet
connected. The supplied URL is an add-zone page, not evidence of an existing zone.
Browser inspection could not start because the Windows sandbox helper failed.
No Bunny zone, API key or account balance was inspected or changed.

Bunny Storage can provide photo storage while Workers hosts the website, D1 retains the SQLite
schema and Firebase provides product authentication. It requires a small private-storage adapter
in place of the native R2 bucket operations. Preserve upload validation, private reads, revision
cleanup, ambiguous-acknowledgement handling, retry keys and record ownership.
The storage-zone access password belongs only in Worker secrets, never client code or Git.

Bunny has a $1 monthly minimum per account with active zones; it is not a permanent free tier.
R2 includes 10 GB-month Standard storage free but requires an activated subscription.
Supabase Free includes 1 GB file storage and 50 MB uploads, with inactivity pausing.
Recheck provider pricing when resuming.

## Next deployment steps

1. Confirm Bunny versus R2/Supabase and obtain the selected zone/bucket metadata through the
   provider's authenticated setup. Do not ask for credentials in chat.
2. Implement and test any required storage adapter; connect a private store.
3. Provision a D1 database and apply the existing schema to the fresh database only.
4. Prepare an explicit direct-deployment Wrangler configuration using real account resources.
   The generated `dist/server/wrangler.json` currently contains Sites placeholder bindings and
   must not be deployed directly to this account unchanged.
5. Configure production Firebase bindings from ignored `outputs/firebase-web-config.json`,
   verify the staff allowlist, keep emulator settings out, and authorize the final host in Firebase.
6. Configure the outer private review gate before making a direct host reachable.
7. Dry-run the deployment, deploy, and verify accounts, uploads, contributor isolation, revisions
   and editorial workflows at the actual protected URL. Record the deployment and source commit.

References: [R2 setup](https://developers.cloudflare.com/r2/get-started/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[Supabase pricing](https://supabase.com/pricing),
[Bunny Storage pricing](https://bunny.net/pricing/storage/),
[Bunny billing FAQ](https://bunny.net/faq/).
