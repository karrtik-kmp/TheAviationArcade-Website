# Prototype scope

## What this prototype contains

The site is a private product prototype for three surfaces: an Airplane Games homepage, a seven-game catalog and photo collection, and an admin/editorial review area. Its purpose is to demonstrate the proposed web experience and a private community-submission workflow. It is not a production or publicly launched website.

The API stores contributor proposals and editorial records in D1, and photos in R2. Contributors authenticate through the host-provided ChatGPT sign-in in a hosted preview; the portable local profile provides a mock sign-in so the flow can be demonstrated offline. Staff access is an email allowlist configured by the host as the `STAFF_EMAILS` secret. Locally, set `STAFF_EMAILS=seedy@sites.test` in ignored `.dev.vars` to use the mock account.

## Review and publication flow

A contributor submits a photograph, factual details, contact information, a rights basis and evidence, a factual source, and the channels for which the photo may be considered. Consent is specifically for private editorial review. It does not grant a final publication license.

An editor must record all five checks before approving a submission: subject identity, image quality, credit, rights evidence, and category. An approved submission can then be made into a separate editorial draft. Publication checks the source approval and proposed-use permissions again. An Aircraft Identifier record requires a games-use offer. A Plane of the Day record requires both Plane of the Day and website/gallery offers. Approval is not publication; the editor must separately save an editorial record as published (or scheduled for Plane of the Day).

## Explicit exclusions

This prototype does not link to player accounts, charge money, connect to the game backend, or establish a production rights claim. There is no real game-content delivery integration. A submitted proposal is only available for private review and is not a grant of a final license to publish or distribute the photograph. The experience has not been launched as a public website.

## Local preview

Use Node.js 24 and the repository's existing dependencies. Run `npm run dev` for the development server, `npm run build` for the build, and `node --test tests/*.test.mjs` for the focused rules tests. If the Windows npm launcher is broken, run `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" run dev` or `... run build`. For the portable mock sign-in, open `/signin-with-chatgpt?return_to=/` and use `seedy@sites.test`. Do not commit `.dev.vars` or use mock sign-in for a hosted preview.
