/**
 * Store contract (openapi 0.22.0): the staff catalog (`/v1/admin/store/products`) and the read-only
 * staff views of purchases and one player's First Class Pass (`/v1/admin/store/purchases`,
 * `/v1/admin/store/players/{principal}/entitlements`). The website records no prices and sells
 * nothing. Browser safe:
 * zod and plain TypeScript only, relative imports only, so the admin desk and `node --test` both load it.
 */
import { z } from "zod";

export const storeProductIdPattern = /^[a-z0-9][a-z0-9._]{0,99}$/;
export const storeProductKinds = ["hint_pack", "miles_pack", "first_class_pass"] as const;
export const storePassPeriods = ["P1M", "P1Y"] as const;
export const storeProductStatuses = ["active", "retired"] as const;

export type StoreProductKind = (typeof storeProductKinds)[number];
export type StorePassPeriod = (typeof storePassPeriods)[number];
export type StoreProductStatus = (typeof storeProductStatuses)[number];

export const storeTitleMax = 100;
export const storeHintsMin = 1;
export const storeHintsMax = 1000;
export const storeMilesMin = 1;
export const storeMilesMax = 1000000;
const storeVersionMax = 2147483647;

/** Website error codes; each value equals its key. */
export const storeErrorCodes = {
  STORE_UNAVAILABLE: "STORE_UNAVAILABLE",
  BACKEND_NOT_CONNECTED: "BACKEND_NOT_CONNECTED",
  ROLES_UNAVAILABLE: "ROLES_UNAVAILABLE",
  BACKEND_UNAVAILABLE: "BACKEND_UNAVAILABLE",
  BACKEND_CONTRACT: "BACKEND_CONTRACT",
  FORBIDDEN: "FORBIDDEN",
  SIGNED_OUT: "SIGNED_OUT",
  INVALID_REQUEST: "INVALID_REQUEST",
  NOT_FOUND: "NOT_FOUND",
  VERSION_CONFLICT: "VERSION_CONFLICT",
  PRODUCT_EXISTS: "PRODUCT_EXISTS",
  CONTENT_INVALID: "CONTENT_INVALID",
  TOO_LARGE: "TOO_LARGE",
  RATE_LIMITED: "RATE_LIMITED",
  CURSOR_STALE: "CURSOR_STALE",
  PLAYER_NOT_FOUND: "PLAYER_NOT_FOUND",
} as const;

const controlCharacter = /[\u0000-\u001f\u007f-\u009f]/;
/** True when the text has a control character (U+0000 to U+001F, U+007F to U+009F: line breaks, tabs, NUL, DEL, C1). */
export const hasControlCharacter = (text: string) => controlCharacter.test(text);
/** Length in Unicode code points (the contract's unit for a title), not UTF-16 units. */
export const codePointLength = (text: string) => [...text].length;
const titleOk = (text: string) => {
  const length = codePointLength(text);
  return length >= 1 && length <= storeTitleMax;
};

const isoDate = z.string().datetime({ offset: true });
const productId = z.string().regex(storeProductIdPattern);
const kind = z.enum(storeProductKinds);
const passPeriod = z.enum(storePassPeriods);
const version = z.number().int().min(1).max(storeVersionMax);

/** What the backend returns. `title` is only length-checked (1..100 code points) here: a stored odd title must not fail the list. */
export const adminStoreProductSchema = z
  .object({
    productId,
    kind,
    hints: z.number().int().min(storeHintsMin).max(storeHintsMax).nullable().optional(),
    miles: z.number().int().min(storeMilesMin).max(storeMilesMax).nullable().optional(),
    passPeriod: passPeriod.nullable().optional(),
    title: z.string().refine(titleOk),
    demo: z.boolean(),
    status: z.enum(storeProductStatuses),
    version: z.number().int().min(1),
    createdAt: isoDate,
    updatedAt: isoDate,
  })
  .strict();
export type AdminStoreProduct = z.infer<typeof adminStoreProductSchema>;

export const adminStoreProductListSchema = z.object({ products: z.array(adminStoreProductSchema) }).strict();

/**
 * PUT body. No `version` creates, `version` edits. A hint pack needs hints and neither miles nor a
 * period; a Miles pack needs miles and neither hints nor a period; a pass needs a period and neither
 * hints nor miles. Title: as the backend does, trimmed first, then 1..100 code points
 * with no control character (U+0000 to U+001F, U+007F to U+009F).
 */
export const storeProductRequestSchema = z
  .object({
    version: version.optional(),
    kind,
    title: z.string().refine((text) => titleOk(text.trim()) && !controlCharacter.test(text.trim())),
    hints: z.number().int().min(storeHintsMin).max(storeHintsMax).optional(),
    miles: z.number().int().min(storeMilesMin).max(storeMilesMax).optional(),
    passPeriod: passPeriod.optional(),
    demo: z.boolean(),
  })
  .strict()
  .refine((body) =>
    body.kind === "hint_pack"
      ? body.hints !== undefined && body.miles === undefined && body.passPeriod === undefined
      : body.kind === "miles_pack"
        ? body.miles !== undefined && body.hints === undefined && body.passPeriod === undefined
        : body.passPeriod !== undefined && body.hints === undefined && body.miles === undefined,
  );
export type StoreProductRequest = z.infer<typeof storeProductRequestSchema>;

export const storeVersionRequestSchema = z.object({ version }).strict();

// ===== Purchases and one player's pass (read only) =====

export const storeEnvironments = ["production", "sandbox", "fake"] as const;
export const storeSubscriptionStatuses = ["active", "grace", "billing_retry", "on_hold", "expired", "revoked"] as const;
export const storeNames = ["apple", "google"] as const;

/** One Firebase uid as the backend accepts it: no ':' '/' or control character (see `isStoreUid` for the rest). */
export const storeUidPattern = /^[^:/\p{Cc}]{1,128}$/u;
const projectPattern = /^[A-Za-z0-9-]{1,64}$/;

/** Same rule as the backend's `uidOfAccountPrincipal`: 1..128 units, no surrounding whitespace, not "." or "..". */
const isStoreUid = (uid: string) =>
  storeUidPattern.test(uid) && uid.length <= 128 && uid.trim() === uid && uid !== "." && uid !== "..";

/** The Firebase project of `firebase:<project>:<uid>`, or null when it is not a well-formed principal. */
export function projectOfPrincipal(principal: string): string | null {
  const parts = principal.split(":");
  if (parts.length !== 3 || parts[0] !== "firebase") return null;
  const [, project, uid] = parts as [string, string, string];
  return projectPattern.test(project) && isStoreUid(uid) ? project : null;
}

/**
 * An id typed by staff: a full principal `firebase:<project>:<uid>` (anything with a ':') or a bare
 * uid, which becomes `firebase:<callerProject>:<uid>`. A principal of another project is refused.
 * Identity stays the principal: never an email or a display name.
 */
export function parsePlayerRef(
  input: string,
  callerProject: string,
): { ok: true; principal: string } | { ok: false; reason: "invalid" | "other_project" } {
  if (!input.includes(":")) {
    return isStoreUid(input) && projectPattern.test(callerProject)
      ? { ok: true, principal: `firebase:${callerProject}:${input}` }
      : { ok: false, reason: "invalid" };
  }
  const project = projectOfPrincipal(input);
  if (project === null) return { ok: false, reason: "invalid" };
  return project === callerProject ? { ok: true, principal: input } : { ok: false, reason: "other_project" };
}

const storeName = z.enum(storeNames);
const nullableText = z.string().nullable();

const hintsGrant = z.object({ type: z.literal("hints"), hints: z.number().int().min(1) }).strict();
const milesGrant = z.object({ type: z.literal("miles"), miles: z.number().int().min(1) }).strict();
const passGrant = z.object({ type: z.literal("first_class_pass"), until: isoDate }).strict();
/** A grant type this website does not know yet is shown raw. A known type with the wrong shape still fails. */
const unknownGrant = z
  .object({ type: z.string().min(1).max(64) })
  .passthrough()
  .refine((grant) => grant.type !== "hints" && grant.type !== "miles" && grant.type !== "first_class_pass");
export const storeGrantSchema = z.union([hintsGrant, milesGrant, passGrant, unknownGrant]);
export type StaffStoreGrant =
  | { type: "hints"; hints: number }
  | { type: "miles"; miles: number }
  | { type: "first_class_pass"; until: string }
  | { type: string; [key: string]: unknown };

export const staffStorePurchaseSchema = z
  .object({
    id: z.number().int().min(1),
    store: storeName,
    principal: z.string(),
    productId,
    kind: z.string().min(1).max(64),
    environment: z.enum(storeEnvironments),
    transactionId: nullableText,
    originalTransactionId: nullableText,
    orderId: nullableText,
    tokenFingerprint: nullableText,
    originalFingerprint: nullableText,
    purchasedAt: isoDate,
    grant: storeGrantSchema,
    createdAt: isoDate,
  })
  .strict();
export type StaffStorePurchase = z.infer<typeof staffStorePurchaseSchema>;

const cursorPattern = /^[A-Za-z0-9_-]{1,100}$/;
export const staffStorePurchaseListSchema = z
  .object({
    purchases: z.array(staffStorePurchaseSchema),
    nextCursor: z.string().regex(cursorPattern).nullable(),
  })
  .strict();

export const staffStoreSubscriptionSchema = z
  .object({
    store: storeName,
    originalTransactionId: nullableText,
    originalFingerprint: nullableText,
    productId,
    status: z.enum(storeSubscriptionStatuses),
    expiresAt: isoDate,
    lastEventAt: isoDate,
    createdAt: isoDate,
  })
  .strict();
export type StaffStoreSubscription = z.infer<typeof staffStoreSubscriptionSchema>;

export const staffEntitlementsSchema = z
  .object({
    principal: z.string(),
    firstClassPass: z.boolean(),
    firstClassUntil: isoDate.nullable(),
    productId: productId.nullable(),
    evaluatedAt: isoDate,
    hasStoreAccount: z.boolean(),
    subscriptions: z.array(staffStoreSubscriptionSchema),
  })
  .strict();
export type StaffEntitlements = z.infer<typeof staffEntitlementsSchema>;

/** Body of the website's search route. Every key optional, none empty; `player` is a uid or a principal (the route resolves it). */
export const purchaseSearchRequestSchema = z
  .object({
    player: z.string().min(1).max(200).optional(),
    productId: productId.optional(),
    store: storeName.optional(),
    transactionRef: z.string().regex(/^[A-Za-z0-9._~:-]{1,1024}$/).optional(),
    orderId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).optional(),
    cursor: z.string().regex(cursorPattern).optional(),
  })
  .strict();
export type PurchaseSearchRequest = z.infer<typeof purchaseSearchRequestSchema>;
