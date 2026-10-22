# Security and privacy review

## Review boundary

Updated 2026-10-22. This reviews the content API, Firebase token/session boundary,
validation helpers and account UI guards. Local browser checks use D1/R2 emulation
and Firebase Auth emulation. Cloud provisioning confirms Auth provider configuration;
it does not prove live user sign-in. This is not a penetration test or a claim of
public-launch readiness.

## Controls present in the reviewed code

- User-owned submission listing and editing are scoped to the authenticated stable user ID. Other users cannot fetch a private submission photo; unauthorized lookups return 404.
- Product routes use verified Firebase identity, independently of hosting headers. Admin routes require a verified email matching the server-only `STAFF_EMAILS` allowlist. Local demo users authenticate through the loopback emulator; no unsigned token is accepted by a production build.
- Tokens require the configured project/issuer/audience, a valid fixed-Google-JWKS signature, current expiry and supported password/Google provider claims. Session cookies are HttpOnly, SameSite and expiry-bounded; production adds Secure and `__Host-`. Auth exchange/logout require the same Origin. Configuration and account responses use private/no-store caching.
- Ownership is namespaced by Firebase project and UID. Legacy host-owned data is not transferred by matching email. Public account snapshots expose a display name, verification status, staff flag and noncredential session fingerprint, not email or tokens.
- Account generations discard stale responses, server fences reject changed-account writes, and captured draft versions preserve optimistic concurrency. Session exchanges/logout are serialized, with cross-tab Web Locks where supported. The fallback only serializes within a tab.
- Write routes require a matching request origin. Submission edits include a version check, and new submissions require an idempotency key. Review and editorial updates also use version-checked database updates; audit inserts are tied to the successful mutation.
- Approval requires all five explicit review checks, rights evidence, an https factual source, and a non-generated image origin. Publishing rechecks approval and channel permissions. POTD additionally requires website/gallery permission.
- Public photo responses are limited to published/scheduled featured content whose source remains approved. Responses set `nosniff`, private/no-store caching for image bytes, and a restrictive content security policy. Editorial fields rendered through React receive normal text escaping.

## Findings and limits

1. **Medium: uploaded image validation checks headers, not full image decoding.** `imageInfo` recognizes a PNG signature/IHDR prefix or a JPEG SOF segment and extracts dimensions; it does not decode the full file, validate PNG chunk integrity, require end markers, or scan for malware. The API serves accepted bytes from R2 with an image MIME type. A malformed or polyglot file with a plausible header may therefore be stored and served. The 12 MB, dimensions, pixel-count, MIME-by-signature, `nosniff`, and CSP checks reduce exposure but do not make this a safe-media pipeline. Before public launch, fully decode/re-encode uploads in a trusted image service and add appropriate abuse scanning and operational limits.

2. **Resolved: concurrent retry response handling.** The route now rereads the winning record after a uniqueness conflict and returns that proposal when its payload and digest match. An uploaded object is not deleted until the database outcome is resolved; the winner's photograph is preserved. `scripts/api-qa.mjs` verified two concurrent creates, one durable record, a successful replay and readable photo bytes after the race.

3. **Operational privacy limit: contact details and original photographs have no retention/deletion workflow in the reviewed routes.** Proposal payloads include an email address, and there is no contributor delete endpoint or retention job in the reviewed API. Keep this as a private prototype with restricted editor access; set a retention policy and deletion path before accepting public submissions.

## Not established by this review

The review does not prove live Google consent, email delivery, MFA, granular staff
roles, edge rate limits, backups, logging access or final licensing. Signed JWTs
are checked on requests, but an already-issued token is not immediately invalidated
by Firebase user disable/revocation; its accepted lifetime is at most one hour.
Immediate revocation enforcement remains separate work. The owner-private hosting
audience is preserved. Contributor review consent does not establish final rights
to publish a photo.

## Integration fixes and verified behavior

The browser regression found that returning asynchronous route promises without awaiting them bypassed
the route's error handler. The dispatcher now awaits those operations. Stale editor versions return
JSON with HTTP 409; invalid timezone requests return JSON with HTTP 422. The complete local workflow
also checks unsigned access, foreign-origin rejection, returned proposals, owner resubmission,
approval, scheduling, future-date exclusion, private public projections and archive behavior.

Demo proposals are explicitly marked and cannot be published, even if a staff member later checks
their review boxes. Samples are not proof of contributor consent or photography permission.
