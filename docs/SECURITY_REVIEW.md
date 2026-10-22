# Security and privacy review

## Review boundary

This is a source review of the prototype API in `app/api/[...path]/route.ts`, validation helpers in `lib/rules.ts`, and request helpers in `lib/server.ts`. It is not a penetration test, a deployed configuration audit, or a claim that the product is ready for public launch. No live D1/R2 service or hosted identity configuration was exercised for this review.

## Controls present in the reviewed code

- User-owned submission listing and editing are scoped to the authenticated stable user ID. Other users cannot fetch a private submission photo; unauthorized lookups return 404.
- Admin routes require the host ChatGPT identity and a matching address from the `STAFF_EMAILS` allowlist. Configure this only as a hosted secret; the local `.dev.vars` setting is for the loopback mock account.
- Write routes require a matching request origin. Submission edits include a version check, and new submissions require an idempotency key. Review and editorial updates also use version-checked database updates; audit inserts are tied to the successful mutation.
- Approval requires all five explicit review checks, rights evidence, an https factual source, and a non-generated image origin. Publishing rechecks approval and channel permissions. POTD additionally requires website/gallery permission.
- Public photo responses are limited to published/scheduled featured content whose source remains approved. Responses set `nosniff`, private/no-store caching for image bytes, and a restrictive content security policy. Editorial fields rendered through React receive normal text escaping.

## Findings and limits

1. **Medium: uploaded image validation checks headers, not full image decoding.** `imageInfo` recognizes a PNG signature/IHDR prefix or a JPEG SOF segment and extracts dimensions; it does not decode the full file, validate PNG chunk integrity, require end markers, or scan for malware. The API serves accepted bytes from R2 with an image MIME type. A malformed or polyglot file with a plausible header may therefore be stored and served. The 12 MB, dimensions, pixel-count, MIME-by-signature, `nosniff`, and CSP checks reduce exposure but do not make this a safe-media pipeline. Before public launch, fully decode/re-encode uploads in a trusted image service and add appropriate abuse scanning and operational limits.

2. **Resolved: concurrent retry response handling.** The route now rereads the winning record after a uniqueness conflict and returns that proposal when its payload and digest match. An uploaded object is not deleted until the database outcome is resolved; the winner's photograph is preserved. `scripts/api-qa.mjs` verified two concurrent creates, one durable record, a successful replay and readable photo bytes after the race.

3. **Operational privacy limit: contact details and original photographs have no retention/deletion workflow in the reviewed routes.** Proposal payloads include an email address, and there is no contributor delete endpoint or retention job in the reviewed API. Keep this as a private prototype with restricted editor access; set a retention policy and deletion path before accepting public submissions.

## Not established by this review

The code review cannot verify production allowlist values, host access policy, D1/R2 backup or retention settings, rate limits at the edge, logging access, dependency provenance, or any production licensing process. The local mock sign-in is intentionally only for portable development and is not proof of hosted identity security. A contributor's consent is for private editorial review and does not establish the final rights needed to publish a photo.

## Integration fixes and verified behavior

The browser regression found that returning asynchronous route promises without awaiting them bypassed
the route's error handler. The dispatcher now awaits those operations. Stale editor versions return
JSON with HTTP 409; invalid timezone requests return JSON with HTTP 422. The complete local workflow
also checks unsigned access, foreign-origin rejection, returned proposals, owner resubmission,
approval, scheduling, future-date exclusion, private public projections and archive behavior.

Demo proposals are explicitly marked and cannot be published, even if a staff member later checks
their review boxes. Samples are not proof of contributor consent or photography permission.
