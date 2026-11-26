/**
 * Backend media (openapi 0.30.0 `Media*` and `ImageRef` schemas). Server side only: the browser
 * imports types from here, never these schemas. Every object is strict, so an answer that drifts
 * from the contract is refused rather than passed on. Relative imports only, so this loads under
 * plain `node --test`.
 */
import { z } from "zod";
import { instagramHandlePattern, normaliseDescription, normaliseInstagramHandle } from "../media-form.ts";

/** openapi `MediaId`: `med-<n>`, no leading zero, at most 15 digits. */
export const mediaIdPattern = /^med-[1-9][0-9]{0,14}$/;
export const mediaStates = ["unverified", "published", "withdrawn"] as const;
export const mediaContentTypes = ["image/jpeg", "image/png"] as const;
/**
 * The v2 statement (0.29.0): acceptance of the Photo Submission Policy and Image License Agreement of
 * 2026-12-01 with its three confirmations (18+, copyright or authority, the agreement). It needs the
 * submission fields (`X-Submission` on an upload, `submission` in `PUT .../rights`).
 */
export const MEDIA_V2_STATEMENT = "v2_agreement_2026-12-01";
/** Rights statements: the ones the API accepts (wording v1, agreement v2), and the import's marker, which is read-only. */
export const mediaUploadStatements = ["v1_own", "v1_authorised", MEDIA_V2_STATEMENT] as const;
export const mediaRightsStatements = ["v1_own", "v1_authorised", MEDIA_V2_STATEMENT, "d1_private_review"] as const;
export type MediaUploadStatement = (typeof mediaUploadStatements)[number];
/** openapi parameter `MediaRightsStatementHeader` (`X-Rights-Statement`). */
export const mediaRightsStatementPattern = /^(v1_(own|authorised)|v2_agreement_2026-12-01)$/;
/** openapi parameter `MediaSubmissionHeader` (`X-Submission`): base64url, no padding, 1-6144 characters. */
export const mediaSubmissionHeaderPattern = /^[A-Za-z0-9_-]{1,6144}$/;
/** openapi parameter `MediaIdempotencyKey`. */
export const mediaIdempotencyKeyPattern = /^[A-Za-z0-9_-]{1,128}$/;

export type MediaState = (typeof mediaStates)[number];
export type MediaContentType = (typeof mediaContentTypes)[number];

/** The website's own error codes for media routes (see MEDIA_PLAN "Error codes"). */
export const mediaErrorCodes = {
  INVALID_REQUEST: "INVALID_REQUEST",
  SIGNED_OUT: "SIGNED_OUT",
  NOT_FOUND: "NOT_FOUND",
  NOTHING_TO_PUBLISH: "NOTHING_TO_PUBLISH",
  VERSION_CONFLICT: "VERSION_CONFLICT",
  TOO_LARGE: "TOO_LARGE",
  UNSUPPORTED_TYPE: "UNSUPPORTED_TYPE",
  MEDIA_INVALID: "MEDIA_INVALID",
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
  LICENCE_INCOMPLETE: "LICENCE_INCOMPLETE",
  BACKEND_CONTRACT: "BACKEND_CONTRACT",
  RATE_LIMITED: "RATE_LIMITED",
  /** API 0.32.0: the account already has the most photos waiting for review (default 20). */
  SUBMISSION_LIMIT: "SUBMISSION_LIMIT",
  STORAGE_UNAVAILABLE: "STORAGE_UNAVAILABLE",
  BACKEND_UNAVAILABLE: "BACKEND_UNAVAILABLE",
  MEDIA_UNAVAILABLE: "MEDIA_UNAVAILABLE",
  BACKEND_NOT_CONNECTED: "BACKEND_NOT_CONNECTED",
  ROLES_UNAVAILABLE: "ROLES_UNAVAILABLE",
  PHOTOGRAPHER_REQUIRED: "PHOTOGRAPHER_REQUIRED",
  FORBIDDEN: "FORBIDDEN",
  CREDIT_POLICY_STAFF_ONLY: "CREDIT_POLICY_STAFF_ONLY",
  SUBMISSIONS_CLOSED: "SUBMISSIONS_CLOSED",
  RIGHTS_ALREADY_STATED: "RIGHTS_ALREADY_STATED",
  MEDIA_DECLINED: "MEDIA_DECLINED",
} as const;
export type MediaErrorCode = (typeof mediaErrorCodes)[keyof typeof mediaErrorCodes];

const mediaId = z.string().regex(mediaIdPattern);
const mediaState = z.enum(mediaStates);
const contentType = z.enum(mediaContentTypes);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const dimension = z.number().int().min(1).max(4096);
const positive = z.number().int().min(1);
const isoDate = z.string().datetime({ offset: true });
const httpUrl = z.string().max(2048).regex(/^https?:\/\//);
/** Code points, as the contract counts them (not UTF-16 units). */
const codePoints = (value: string) => [...value].length;
const name200 = z.string().min(1).max(200);
/** A stored single-line text of 1-200 code points (titles, names). */
const text200 = z.string().refine((text) => codePoints(text) >= 1 && codePoints(text) <= 200);
const controlOrLoneSurrogate = /[\u0000-\u001f\u007f-\u009f]|[\uD800-\uDFFF]/u;
/** A submitted single-line text: no control character or lone surrogate, then 1-200 code points once trimmed. */
const submittedText200 = z
  .string()
  .refine((raw) => !controlOrLoneSurrogate.test(raw) && codePoints(raw.trim()) >= 1 && codePoints(raw.trim()) <= 200);
// The Instagram handle rule lives in the zod-free browser module, like the description rule.
export { instagramHandlePattern, normaliseInstagramHandle };
const submittedHandle = z
  .string()
  .nullable()
  .refine((raw) => {
    const handle = normaliseInstagramHandle(raw);
    return handle === null || instagramHandlePattern.test(handle);
  });

/** openapi `MediaLicence`: the licence of one file version. */
export const mediaLicenceSchema = z
  .object({
    credit: name200.nullable(),
    licenceName: name200.nullable(),
    licenceUrl: httpUrl.nullable(),
    sourceUrl: httpUrl.nullable(),
    attributionText: z.string().max(1000).nullable(),
    creditRequired: z.boolean(),
  })
  .strict();
export type MediaLicence = z.infer<typeof mediaLicenceSchema>;

/** openapi `MediaLicenceUpdate`: a partial edit, at least one key; `null` clears (not `creditRequired`). */
export const mediaLicenceUpdateSchema = z
  .object({
    credit: name200.nullable(),
    licenceName: name200.nullable(),
    licenceUrl: httpUrl.nullable(),
    sourceUrl: httpUrl.nullable(),
    attributionText: z.string().max(1000).nullable(),
    creditRequired: z.boolean(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length >= 1, { message: "licence needs at least one key" });
export type MediaLicenceUpdate = z.infer<typeof mediaLicenceUpdateSchema>;

/** openapi `MediaRights`. `statedBy` is present for admin callers only. */
export const mediaRightsSchema = z
  .object({
    statement: z.enum(mediaRightsStatements),
    statedAt: isoDate,
    statedBy: z.string().min(1).max(256).optional(),
  })
  .strict();
export type MediaRights = z.infer<typeof mediaRightsSchema>;

/** openapi `MediaSubmission`: the photographer's submission fields (`X-Submission`, or a v2 `PUT .../rights`). */
export const mediaSubmissionObject = z
  .object({
    fullName: submittedText200,
    title: submittedText200,
    credit: submittedText200,
    instagramHandle: submittedHandle.optional(),
    instagramDisplayConsent: z.boolean().optional(),
  })
  .strict();
export const mediaSubmissionSchema = mediaSubmissionObject
  .refine((value) => !value.instagramDisplayConsent || normaliseInstagramHandle(value.instagramHandle) !== null, {
    message: "display consent needs a handle",
  });
export type MediaSubmission = z.infer<typeof mediaSubmissionSchema>;

/**
 * Reads an `X-Submission` value: base64url without padding, canonical, of UTF-8 JSON that is a valid
 * `MediaSubmission`. Null when it is not. The value is passed on to the backend as it came, never logged.
 */
export function decodeSubmissionHeader(value: string): MediaSubmission | null {
  if (!mediaSubmissionHeaderPattern.test(value) || value.length % 4 === 1) return null;
  let bytes: Uint8Array;
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
  // Canonical: encoding the bytes again gives the same text (no stray bits in the last character).
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const again = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (again !== value) return null;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return null;
  try {
    const parsed = mediaSubmissionSchema.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** openapi `MediaItem.submission`: private, owner and admins only; null until a v2 upload, move or edit creates it. */
export const mediaItemSubmissionSchema = z
  .object({
    fullName: text200.nullable(),
    instagramHandle: z.string().regex(instagramHandlePattern).nullable(),
    instagramDisplayConsent: z.boolean(),
  })
  .strict();
export type MediaItemSubmission = z.infer<typeof mediaItemSubmissionSchema>;

export const mediaReviewDecisions = ["changes_requested", "declined"] as const;
/** openapi `MediaReview` (0.30.0). `decidedBy` is present for admin callers only. */
export const mediaReviewSchema = z
  .object({
    decision: z.enum(mediaReviewDecisions),
    reason: z.string().refine((text) => codePoints(text) >= 1 && codePoints(text) <= 500),
    version: positive,
    decidedAt: isoDate,
    decidedBy: z.string().min(1).max(256).optional(),
  })
  .strict();
export type MediaReview = z.infer<typeof mediaReviewSchema>;

/** openapi `MediaVersion`. */
export const mediaVersionSchema = z
  .object({
    version: positive,
    sha256,
    contentType,
    byteSize: z.number().int().min(1).max(5242880),
    width: dimension,
    height: dimension,
    licence: mediaLicenceSchema,
    description: z
      .string()
      .refine((text) => codePoints(text) >= 1 && codePoints(text) <= 2000)
      .nullable(),
    title: text200.nullable(),
    rights: mediaRightsSchema.nullable(),
    publishedAt: isoDate.nullable(),
    createdAt: isoDate,
  })
  .strict();
export type MediaVersion = z.infer<typeof mediaVersionSchema>;

/** openapi `MediaItem`. `owner` is present only for admin callers. */
export const mediaItemSchema = z
  .object({
    id: mediaId,
    state: mediaState,
    revision: positive,
    draftVersion: positive,
    publishedVersion: positive.nullable(),
    draft: mediaVersionSchema,
    submission: mediaItemSubmissionSchema.nullable(),
    review: mediaReviewSchema.nullable(),
    owner: z.string().min(1).max(256).optional(),
    createdAt: isoDate,
    updatedAt: isoDate,
  })
  .strict();
export type MediaItem = z.infer<typeof mediaItemSchema>;

const imageRefBase = {
  mediaId,
  version: positive,
  sha256,
  contentType,
  width: dimension,
  height: dimension,
  licence: mediaLicenceSchema,
};
const httpsUrl = z
  .string()
  .url()
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "https only");

/** openapi `ImageRef`: a signed https link with its expiry, or both null with `reason: cdn_not_configured`. */
export const imageRefSchema = z.union([
  z.object({ ...imageRefBase, url: httpsUrl, expiresAt: isoDate, reason: z.null() }).strict(),
  z
    .object({ ...imageRefBase, url: z.null(), expiresAt: z.null(), reason: z.literal("cdn_not_configured") })
    .strict(),
]);
export type ImageRef = z.infer<typeof imageRefSchema>;

/** openapi `MediaDetail`. */
export const mediaDetailSchema = z
  .object({ item: mediaItemSchema, versions: z.array(mediaVersionSchema), preview: imageRefSchema })
  .strict();
export type MediaDetail = z.infer<typeof mediaDetailSchema>;

/** openapi `MediaList`. */
export const mediaListSchema = z.object({ items: z.array(mediaItemSchema), nextCursor: z.string().nullable() }).strict();
export type MediaList = z.infer<typeof mediaListSchema>;

/** openapi `MediaImages`. */
export const mediaImagesSchema = z.object({ images: z.array(imageRefSchema).max(50) }).strict();
export type MediaImages = z.infer<typeof mediaImagesSchema>;

const fence = z.number().int().min(1).max(2147483647);
/** openapi `MediaRevisionRequest` (publish, withdraw). */
export const mediaRevisionRequestSchema = z.object({ revision: fence }).strict();
export type MediaRevisionRequest = z.infer<typeof mediaRevisionRequestSchema>;

/** openapi `MediaRightsRequest` (`PUT media/:id/rights`): a v1 statement alone, or v2 with the submission. */
export const mediaRightsRequestV1Schema = z
  .object({ revision: fence, statement: z.enum(["v1_own", "v1_authorised"]) })
  .strict();
export const mediaRightsRequestV2Schema = z
  .object({ revision: fence, statement: z.literal(MEDIA_V2_STATEMENT), submission: mediaSubmissionSchema })
  .strict();
export const mediaRightsRequestSchema = z.union([mediaRightsRequestV1Schema, mediaRightsRequestV2Schema]);
export type MediaRightsRequest = z.infer<typeof mediaRightsRequestSchema>;

// Everything but a newline (CRLF is folded to LF first): no tab, no other control character, even at the ends.
// eslint-disable-next-line no-control-regex
const disallowedInDescription = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]/;
// The description as the backend stores it (CRLF becomes LF, then trimmed). One copy, kept in the zod-free
// browser module so the screens and the server cannot drift; media-form only imports types from here.
export { normaliseDescription };
/**
 * openapi `MediaEditRequest.description` (a string, or null to clear): at most 2000 code points as
 * typed, CRLF becomes LF, then trimmed to 1..2000 code points. Newlines are the only control
 * character allowed; a leading or trailing tab is refused too (checked before trimming).
 */
export const mediaDescriptionSchema = z
  .string()
  .refine((raw) => codePoints(raw) <= 2000 && !disallowedInDescription.test(raw.replace(/\r\n/g, "\n")))
  .transform(normaliseDescription)
  .pipe(z.string().refine((text) => codePoints(text) >= 1 && codePoints(text) <= 2000));

/** The object shape of `MediaEditRequest` (exported for the contract test). */
export const mediaEditRequestObject = z
  .object({
    revision: fence,
    licence: mediaLicenceUpdateSchema.optional(),
    description: mediaDescriptionSchema.nullable().optional(),
    title: submittedText200.nullable().optional(),
    fullName: submittedText200.nullable().optional(),
    instagram: z
      .object({ handle: submittedHandle, displayConsent: z.boolean() })
      .strict()
      .refine((value) => !value.displayConsent || normaliseInstagramHandle(value.handle) !== null)
      .optional(),
    note: z.string().min(1).max(500).optional(),
  })
  .strict();
/** openapi `MediaEditRequest`: at least one of `licence`, `description`, `title`, `fullName` and `instagram`. */
export const mediaEditRequestSchema = mediaEditRequestObject.refine(
  (body) => (["licence", "description", "title", "fullName", "instagram"] as const).some((key) => body[key] !== undefined),
  { message: "licence, description, title, fullName or instagram is required" },
);
export type MediaEditRequest = z.infer<typeof mediaEditRequestSchema>;
