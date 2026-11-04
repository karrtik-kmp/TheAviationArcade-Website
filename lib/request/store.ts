/**
 * Store catalog contract (openapi 0.20.0, `/v1/admin/store/products`): the staff view of the
 * products the game app can offer. The website records no prices and sells nothing. Browser safe:
 * zod and plain TypeScript only, relative imports only, so the admin desk and `node --test` both load it.
 */
import { z } from "zod";

export const storeProductIdPattern = /^[a-z0-9][a-z0-9._]{0,99}$/;
export const storeProductKinds = ["hint_pack", "first_class_pass"] as const;
export const storePassPeriods = ["P1M", "P1Y"] as const;
export const storeProductStatuses = ["active", "retired"] as const;

export type StoreProductKind = (typeof storeProductKinds)[number];
export type StorePassPeriod = (typeof storePassPeriods)[number];
export type StoreProductStatus = (typeof storeProductStatuses)[number];

export const storeTitleMax = 100;
export const storeHintsMin = 1;
export const storeHintsMax = 1000;
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
} as const;

const controlCharacter = /[\u0000-\u001f\u007f]/;
/** True when the text has a control character (line breaks, tabs, NUL, DEL). */
export const hasControlCharacter = (text: string) => controlCharacter.test(text);

const isoDate = z.string().datetime({ offset: true });
const productId = z.string().regex(storeProductIdPattern);
const kind = z.enum(storeProductKinds);
const passPeriod = z.enum(storePassPeriods);
const version = z.number().int().min(1).max(storeVersionMax);

/** What the backend returns. `title` is only length-checked here: a stored odd title must not fail the list. */
export const adminStoreProductSchema = z
  .object({
    productId,
    kind,
    hints: z.number().int().min(storeHintsMin).max(storeHintsMax).nullable().optional(),
    passPeriod: passPeriod.nullable().optional(),
    title: z.string().min(1).max(storeTitleMax),
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
 * PUT body. No `version` creates, `version` edits. A hint pack needs hints and no period; a pass
 * needs a period and no hints. Title: 1..100 UTF-16 units, no control characters, sent as typed
 * (the form trims before sending, so what is checked is exactly what is sent).
 */
export const storeProductRequestSchema = z
  .object({
    version: version.optional(),
    kind,
    title: z
      .string()
      .min(1)
      .max(storeTitleMax)
      .refine((text) => !controlCharacter.test(text)),
    hints: z.number().int().min(storeHintsMin).max(storeHintsMax).optional(),
    passPeriod: passPeriod.optional(),
    demo: z.boolean(),
  })
  .strict()
  .refine((body) =>
    body.kind === "hint_pack"
      ? body.hints !== undefined && body.passPeriod === undefined
      : body.passPeriod !== undefined && body.hints === undefined,
  );
export type StoreProductRequest = z.infer<typeof storeProductRequestSchema>;

export const storeVersionRequestSchema = z.object({ version }).strict();
