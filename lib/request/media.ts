/**
 * Backend media (openapi 0.17.0 `Media*` and `ImageRef` schemas). Server side only: the browser
 * imports types from here, never these schemas. Every object is strict, so an answer that drifts
 * from the contract is refused rather than passed on. Relative imports only, so this loads under
 * plain `node --test`.
 */
import { z } from "zod";

/** openapi `MediaId`: `med-<n>`, no leading zero, at most 15 digits. */
export const mediaIdPattern = /^med-[1-9][0-9]{0,14}$/;
export const mediaStates = ["unverified", "published", "withdrawn"] as const;
export const mediaContentTypes = ["image/jpeg", "image/png"] as const;
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
  STORAGE_UNAVAILABLE: "STORAGE_UNAVAILABLE",
  BACKEND_UNAVAILABLE: "BACKEND_UNAVAILABLE",
  MEDIA_UNAVAILABLE: "MEDIA_UNAVAILABLE",
  BACKEND_NOT_CONNECTED: "BACKEND_NOT_CONNECTED",
  ROLES_UNAVAILABLE: "ROLES_UNAVAILABLE",
  PHOTOGRAPHER_REQUIRED: "PHOTOGRAPHER_REQUIRED",
  FORBIDDEN: "FORBIDDEN",
  CREDIT_POLICY_STAFF_ONLY: "CREDIT_POLICY_STAFF_ONLY",
  SUBMISSIONS_CLOSED: "SUBMISSIONS_CLOSED",
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
const name200 = z.string().min(1).max(200);

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

/** openapi `MediaEditRequest`. */
export const mediaEditRequestSchema = z
  .object({ revision: fence, licence: mediaLicenceUpdateSchema, note: z.string().min(1).max(500).optional() })
  .strict();
export type MediaEditRequest = z.infer<typeof mediaEditRequestSchema>;
