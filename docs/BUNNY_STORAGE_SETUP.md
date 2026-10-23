# Bunny Storage for the Cloudflare prototype

| Setting | Selected value |
| --- | --- |
| Storage zone / S3 Access Key ID | `aviation-arcade-website` |
| Primary region | Frankfurt, Germany |
| Region code | `de` |
| S3 endpoint | `https://de-s3.storage.bunnycdn.com` |
| S3 compatibility | Enabled when creating the zone |
| Prototype tier | Standard; one primary region is sufficient initially |

Keep the supplied Frankfurt zone. S3 compatibility must be enabled at creation and cannot be
added later. If the zone already exists with these settings, do not create a duplicate.
The app serves contributor photos through authenticated server routes. A public Bunny CDN
pull zone is not needed; do not expose the originals through a public pull zone.

## Local private settings

From the website repository, copy the example once:

```powershell
if (!(Test-Path -LiteralPath '.dev.vars.cloudflare')) {
  Copy-Item -LiteralPath '.dev.vars.cloudflare.example' -Destination '.dev.vars.cloudflare'
}
```

Fill these fields locally in `.dev.vars.cloudflare`:

- `BUNNY_STORAGE_PASSWORD`: the zone's read-write **Storage Zone Password**, also called its
  **S3 Secret Access Key**, in Bunny's Access tab. Do not use your Bunny account API key.
- `STAFF_EMAILS`: comma-separated Firebase editor emails. Their email must also be verified.

Zone, endpoint, region and the production Firebase project are already recorded. Blank Firebase
Web SDK fields can be resolved from the existing ignored `outputs/firebase-web-config.json`.
Keep this deployment file separate from `.dev.vars`, which still uses the local Auth emulator.
`FIREBASE_AUTH_EMULATOR_HOST` is rejected in the deployment file. Never commit or paste passwords.

## Verify and prepare

```powershell
npm run bunny:check
npm run build
npm run cloudflare:prepare
```

The live check uploads one small random `setup-checks/` object, downloads and compares its bytes,
then deletes it. It does not list, change or delete existing photos. Without a password it exits
before sending a request. It never prints credentials.

Preparation creates ignored `outputs/cloudflare-deploy/wrangler.json` and derives ignored
`outputs/cloudflare-secrets.json` from the current private settings. Both password and staff
allowlist must be filled before deployment; blank settings also clear any old generated values.
The public config contains no Bunny password. The direct config omits R2 and
keeps `workers_dev` and preview URLs disabled until the private review gate is configured.
Do not edit or commit generated outputs. Rebuild/re-prepare before an eventual deployment.

No new Worker has been deployed and no live Bunny request has succeeded yet. The remaining
host/privacy/Firebase/CLI steps are in [Cloudflare setup](CLOUDFLARE_SETUP.md).

Official references: [Bunny S3 setup and credentials](https://bunny.net/docs/storage/s3),
[Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
