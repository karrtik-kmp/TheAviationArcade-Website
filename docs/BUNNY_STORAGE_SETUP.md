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
- `ROLES_SOURCE` (not a secret, default `mock`): where roles come from. With `mock`, fill
  `MOCK_ADMIN_EMAILS` and `MOCK_PHOTOGRAPHER_EMAILS` (verified emails, uploaded as secrets); the deploy
  warns when the admin list is empty. Switch to `backend` once the game backend is hosted.
- `GAME_API_BASE_URL` (optional, not a secret): the game backend origin, used when `ROLES_SOURCE=backend`.
  Without it the deployed site has no admins and the deploy only warns.

Zone, endpoint, region and the production Firebase project are already recorded. Blank Firebase
Web SDK fields can be resolved from the existing ignored `outputs/firebase-web-config.json`.
Keep this deployment file separate from `.dev.vars`, which still uses the local Auth emulator.
`FIREBASE_AUTH_EMULATOR_HOST` is rejected in the deployment file. Never commit or paste passwords.

## Verify

```powershell
npm run bunny:check
```

The live check uploads one small random `setup-checks/` object, downloads and compares its bytes,
then deletes it. It does not list, change or delete existing photos. Without a password it exits
before sending a request. It never prints credentials.

On the Node server the `BUNNY_STORAGE_*` settings and `PHOTO_STORAGE_PROVIDER=bunny` go in the server's
settings file (see `web.env.example`); there is no separate deploy step. The Cloudflare preparation and
deploy commands this page used to list were retired on 2026-11-05.

The live Bunny check passed on 2026-10-23: upload, identical-byte download and deletion.
The Worker is live with Bunny and D1 behind the approved private Access gate; preview URLs
remain disabled. Firebase has authorized the exact hostname, and the user confirmed Access
and Firebase sign-in. The deployment state and remaining checks are in
[Cloudflare setup](CLOUDFLARE_SETUP.md).

Official references: [Bunny S3 setup and credentials](https://bunny.net/docs/storage/s3),
[Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
