# Airplane Games website and admin prototype

The sole source directory is `H:/Work/TheAviationArcade/website`. This standalone repository contains
the branded homepage, seven-game catalog, community photographer portal, Aircraft Identifier editor,
Plane of the Day scheduler and staff review workflow. It is a private product prototype.

Private review: [website](https://airplane-games-community-prototype.givingstar7.chatgpt.site),
[admin](https://airplane-games-community-prototype.givingstar7.chatgpt.site/admin),
[photographer portal](https://airplane-games-community-prototype.givingstar7.chatgpt.site/contribute).
The owner-only deployment succeeded on 2026-10-22. The task board records the deployed source commit.

## Run locally

Use Node.js 24 (minimum 22.13). For a fresh checkout, install the locked dependencies, create the
ignored local staff setting, build once and apply the generated schema to the local database:

```powershell
npm run install:ci
# Put STAFF_EMAILS=seedy@sites.test in .dev.vars (never commit this file).
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_charming_spitfire.sql
```

Do not replay an already-applied local migration. Then use:

```powershell
node --version
npm run dev
npm run build
node --test tests/*.test.mjs
```

The project scripts start the Vite/Vinext development server and create the deployable build. If the Windows `npm` launcher does not work in your shell, call npm's JavaScript CLI directly:

```powershell
node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" run dev
node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" run build
```

Open `/admin` and click **Try demo editor** to use the local mock account `seedy@sites.test`, with
no password. **Load demo data** creates two clearly marked sample proposals and two editorial
drafts without duplicating them. Sample content cannot be published. This mock login is limited to
loopback development; the hosted private site uses real ChatGPT sign-in and the staff allowlist.

## Content and storage

The app's submission and editorial API uses Cloudflare D1 for records and audit events, and R2 for uploaded photographs. Local previews use the configured local bindings. In a hosted private preview, configure the D1 and R2 bindings and set the `STAFF_EMAILS` secret to a comma-separated list of authorized editor email addresses. For a portable local preview, put `STAFF_EMAILS=seedy@sites.test` in ignored `.dev.vars`; never commit that file or use the mock identity as hosted authentication.

Contributors can offer photographs for private review and propose the channels where they may be considered. Submission consent permits private editorial review only. Editors record five checks (identity, image quality, credit, rights, and category) before approval. A separate editorial action creates draft content, and publishing requires an approved source plus the applicable proposed-use permission. For Plane of the Day, the contributor must have offered both Plane of the Day and website/gallery use.

## Prototype boundaries

There is no real player account linking, payment, game backend integration, production rights claim, or public launch. A community contribution is a proposal for private review; it does not by itself grant a final publication license. See [docs/PROTOTYPE_SCOPE.md](docs/PROTOTYPE_SCOPE.md) and [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md).

## Data, assets and maintenance

- [Task board](docs/TASKS.md): accepted scope, owners, verification and next work.
- [Asset provenance](docs/ASSET_PROVENANCE.md): existing logo/fonts/photos, private-preview rights limits,
  generated decorative illustration and reproducible optimization scripts.
- `data/reference-airports.json`: 15 online OurAirports references, source URL, fetch time and checksum.
  `python scripts/fetch-reference-data.py` refreshes that snapshot and saves the original license.
  Reference data does not automatically become approved game content.
- `docs/evidence`: browser workflow results, API retry evidence, responsive screenshots and Lighthouse.
- `node node_modules/typescript/bin/tsc --noEmit`: type check.
- `scripts/browser-qa.mjs` and `scripts/api-qa.mjs`: Chrome checks. Set `PLAYWRIGHT_MODULE` to an
  installed Playwright module; `QA_ORIGIN` defaults to `http://127.0.0.1:5173`.

Public links use native navigation to avoid a verified Vinext beta RSC prefetch error. Keep this
workaround until the framework behavior is verified in a later upgrade. Application packages are
locked; temporary formatting, font-conversion and Lighthouse helpers live under ignored `work/`.

## Verification at this checkpoint

TypeScript, seven rule tests, eight browser workflows, concurrent retry/photo-retention checks and
the final production build pass. The production browser smoke reports zero console errors.
Lighthouse scores are performance 82, accessibility 100 and best practices 100; CLS is 0 and total
blocking time is 0ms. Throttled-mobile LCP is 4.1s, so further loading optimization remains open.
Search indexing stays disabled for this private prototype. See `docs/evidence` for the actual results.
