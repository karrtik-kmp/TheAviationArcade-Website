# Plan: FAQ managed in the CMS (Backend + Admin + website), 2026-11-26

**Status:** passed the plan-review gate with changes (backend-expert, frontend-expert, senior-lead; changes folded in).
Owner of this plan: website session. Two decisions wait for the user (end of file).

## Why

Client comment (Josh, 2026-11-26): "for the faq, if there could be a cms that would make it the easiest, so i can
adjust as things change." This decides the FAQ half of SRS OI-19 / website CQ-5: **staff edit the FAQ in the
Admin, the Backend stores and publishes it, and the website reads it.** SRS IDs: WB-FAQ-01, -02, -04, -05;
WB-FAQ-03 gameplay guides are a category in the same FAQ.

Content: client text only; staff only transcribe it. Subscription answers must not offer a web checkout
(OI-21). Nothing is seeded.

Out of this wave: marketplace and partners (they need images, affiliate links and per-item status, which fits
their own tables, SH-11; waits for website CQ-2/CQ-8), contact form.

## Website now (done in this session)

`/faq` and `/marketplace` "coming soon" pages (`components/ComingSoonPage.tsx`), footer links. No invented
questions, products or dates.

## Backend (Backend session): reuse content documents (Option A)

The document machinery already has what the FAQ needs: per-name lock with 409 on a stale draft version,
immutable published rows with digest checks, discard, one `content_publish` audit row per publish
(`src/content/documents/content-admin.service.ts`, `document-store.ts`). Own tables (Option B) would rebuild it.

1. **Website-only document.** Add `faq` as a *site* document (e.g. `SITE_DOCUMENT_NAMES`), kept **out of** the
   game: not in `documentsInForce`, `buildManifest`, `catalogVersion`, the Logbook ETag, `GET
   /v1/content/documents` or the `isDocumentName` check of `content-documents.controller.ts`. Test: manifest bytes
   and Logbook ETag unchanged after a FAQ publish.
2. **Empty base.** `faq` has an implicit empty base `{format: "faq.v1", version, categories: []}` so the first
   draft can be made without seed; publishing an empty FAQ → 409 `nothing_to_publish`.
3. **Small edit operations.** Request bodies are capped at 16 KB, so the draft is not sent whole. The full draft
   lives in `content_drafts.edits`; PATCH takes operations: upsert / remove / move category, upsert / remove /
   move entry. Answer ≤ 2000 code points (as Field Award `criteria`), question ≤ 200, category title ≤ 80, ids
   `^[a-z0-9-]{1,64}$` unique, ≤ 30 categories, ≤ 300 entries. Test one entry at the 16 KB edge.
4. **Text rules.** Reuse `text()` (`drafts.ts`): trims leading/trailing space, rejects U+0000 and lone surrogates;
   line endings normalised to `\n` before the control-character check; inner `\n` kept. Answers are plain
   text: blank line = paragraph; the website links `https://` URLs and site paths. No HTML, no Markdown. Shape in
   a zod `strictObject` in `documents.ts` (runs on every read).
5. **Migration.** New migration drops and re-adds the two name CHECK constraints with `'faq'` (`schema.ts`
   ~1031, ~1059); 0011/0013 untouched. Add `faq` to every exhaustive switch (`validateDocument`, `verify`,
   `ParsedDocuments`, `EDIT_REQUESTS`, `STORED_EDITS`, `describeChanges`, `preview`, PATCH error message).
6. **Public read** `GET /v1/public/faq` (`@Public() @SkipClientVersion()`, as `media-guest.controller.ts`): the
   published body + `version` + `publishedAt`; `ETag` (sha256), `Cache-Control: no-cache`, 304 on
   `If-None-Match`; errors keep `no-store`; 404 `not_found` (or a new `faq_not_published` in `x-error-codes`)
   before the first publish. Shared per-IP public budget (`RATE_LIMIT_PUBLIC_PER_MIN`, 60) with media and
   Plane of the Day: settle the open follow-up "revisit with the user before the public read gets a consumer"
   (Backend TASKS) in this wave.
7. **Roles.** Admin routes stay admin-only; the demo account never holds `admin`. Test: demo account 403 on PATCH
   and publish.
8. **Contract** 0.32.0 → 0.33.0 with changelog, `npm run contracts:write`, vendored byte-identical into website
   and Admin.
9. **Tests:** two PATCHes at once (one 409), publish then edit, read before first publish, 304, 429, trim and
   line-ending rules. Commands: typecheck, test, test:e2e, contracts:write.

**Timing:** lands after the joint dev deploy already waiting (migrations 0027–0031, API 0.29–0.32), as 0.33.

## Admin (Admin session)

- "FAQ" desk, staff only; demo admin view-only.
- Edit the draft: add / rename / reorder / remove categories and entries (Move up / Move down buttons,
  keyboard reachable, focus stays on the moved item; no drag-only), each change one PATCH operation.
- Plain textarea for answers; live preview rendered by the **same** renderer as the website (copied into both
  repos, with a shared fixture test).
- Save (base version), Discard, Publish (confirm dialog with the list of changes), and a view of what is live.
- On 409 keep the editor's typed text: notice in a `role="alert"` region, reload the live/draft view in place,
  replace the edit only when the editor chooses; never resend. Tell a version conflict apart from
  `ACCOUNT_CHANGED` / 401 / 403 (those go to `blockAccess`), as `AdminApp.tsx` ~371–466 does; use
  `drafts.open("faq", version)` and `drafts.isCurrent(generation)`.
- Demo admin: an empty, explanatory FAQ desk with controls disabled. No sample questions.
- Reorder: focus stays on the moved item's same button (or the other one if it becomes disabled), "Moved to
  position 3 of 8" in a polite live region (pattern `StoreDesk.tsx` ~170–200), accessible names include the
  question. Remove/Publish dialogs trap focus, return it to the trigger, close on Escape.
- Checks: typecheck, test, build; browser: keyboard reorder, 409 path, 375 px.

## Website reader (after the contract)

- New tokenless public reader (`lib/request/backend.ts` always sends a member bearer). Explicit in-process cache,
  not Next ISR (Vinext beta): fresh 60 s, stale-on-error 24 h, one request in flight, timeout, `If-None-Match`,
  strict schema check (a malformed body = unavailable). Unit tests: fresh, stale, expired, 404.
- Answer renderer, safe by construction: paragraphs → React text nodes and `<a>`; never
  `dangerouslySetInnerHTML`; links only `^https://` (parsed with `URL`, trailing punctuation left out) and site
  paths `^/[a-z0-9-/#]*` without `//` (through `SiteLink`); external links `rel="noopener noreferrer"`; single
  newline → `<br>`. One module, copied byte-identical to the Admin; tests for `javascript:`, `//evil`, trailing
  `.` / `)`.
- Category `h2`, entries as `<details id="faq-<id>">` with the question in `<summary>`; open the target on load
  and `hashchange`; `:focus-visible` outline, 44 px summary; existing `.prose details` styles and tokens.
- Search (WB-FAQ-02): input rendered after hydration (no JS → everything shows, no dead input), `<label>`,
  `type="search"`, debounced "4 of 37 answers" in a live region, "No answers match" with a clear button, empty
  categories hidden.
- FAQPage JSON-LD from the same data, `<` escaped, plain-text answers, none on the "coming soon" state (NFR-03).
- Nav: FAQ and Marketplace in the footer and the mobile menu; the desktop header stays at three items until the
  FAQ has content (recheck 1201 px then); Marketplace stays out of the header until CQ-2/CQ-8.
- Empty, 404 or unavailable → the current "coming soon" page.
- Checks: typecheck, test, build; browser: search with keyboard and screen-reader announcement, no-JS view,
  anchors, 320 px.

## Order

1. Backend FAQ wave (after the pending dev deploy).
2. Admin desk and website reader in parallel on contract 0.33.0.
3. Josh enters the FAQ (where: decision 2).

## Decisions for the user

1. **Josh's access.** Admin routes need an active `admin` role, which also opens Store, Users and media
   publishing. Give Josh full `admin`, or add a narrower content-editor role (Backend ADR-0002 change)?
2. **Where Josh edits.** Dev is his demo (ruling 11-16) and nothing copies dev content to prod. Edit on prod
   (`admin.`) directly, or on dev with a promote step?

Afterwards: record the OI-19 (FAQ half) ruling in PROJECT_STATE §3 and SRS §9 (root session), and the tasks in
website, Admin and Backend TASKS.
