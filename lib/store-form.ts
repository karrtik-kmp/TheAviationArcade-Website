/**
 * Browser-safe helpers for the Store catalog desk: labels, the client-side checks that mirror the
 * server's request schema, the request body, and outcome mapping. Relative imports only, so this
 * loads under plain `node --test`. The website records no prices and sells nothing.
 */
import {
  codePointLength,
  hasControlCharacter,
  storeHintsMax,
  storeHintsMin,
  storeMilesMax,
  storeMilesMin,
  storePassPeriods,
  storeProductIdPattern,
  storeTitleMax,
} from "./request/store.ts";
import type {
  AdminStoreProduct,
  StorePassPeriod,
  StoreProductKind,
  StoreProductRequest,
} from "./request/store.ts";

export type StoreMode = "create" | "edit";

/** Form values as typed: `hints` is text so an empty or half-typed box can be reported. */
export type StoreDraft = {
  productId: string;
  kind: StoreProductKind;
  title: string;
  hints: string;
  miles: string;
  passPeriod: StorePassPeriod | "";
};
export type StoreField = "productId" | "title" | "hints" | "miles" | "passPeriod";
export type StoreErrors = Partial<Record<StoreField, string>>;

/** Order the fields appear in the form, for focusing the first invalid one. */
export const storeFields: readonly StoreField[] = ["productId", "title", "hints", "miles", "passPeriod"];

export function storeProductLabel(kind: StoreProductKind): string {
  if (kind === "hint_pack") return "Hint pack";
  if (kind === "miles_pack") return "Miles pack";
  return "First Class Pass";
}

export function termLabel(period: StorePassPeriod): string {
  return period === "P1M" ? "Monthly term" : "Yearly term";
}

/** "5,000 Miles" with a fixed locale so the text is the same everywhere. */
export function milesLabel(miles: number): string {
  return `${miles.toLocaleString("en-US")} Miles`;
}

/** What a product contains, for the table: "5 hints", "5,000 Miles", "Monthly term", or a dash when the record has none. */
export function contentsLabel(row: Pick<AdminStoreProduct, "kind" | "hints" | "miles" | "passPeriod">): string {
  if (row.kind === "hint_pack") {
    if (typeof row.hints !== "number") return "—";
    return `${row.hints} ${row.hints === 1 ? "hint" : "hints"}`;
  }
  if (row.kind === "miles_pack") return typeof row.miles === "number" ? milesLabel(row.miles) : "—";
  return row.passPeriod ? termLabel(row.passPeriod) : "—";
}

/** A blank draft for the create panel. */
export function emptyDraft(): StoreDraft {
  return { productId: "", kind: "hint_pack", title: "", hints: "", miles: "", passPeriod: "" };
}

/** A stored product as edit-form values. */
export function draftOf(row: AdminStoreProduct): StoreDraft {
  return {
    productId: row.productId,
    kind: row.kind,
    title: row.title,
    hints: typeof row.hints === "number" ? String(row.hints) : "",
    miles: typeof row.miles === "number" ? String(row.miles) : "",
    passPeriod: row.passPeriod ?? "",
  };
}

/** Whole number from typed text, or null when it is not one (empty, signs, decimals and exponents refused). */
export function parseHints(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,6}$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** Whole number of Miles from typed text (up to 7 digits), or null when it is not one. */
export function parseMiles(text: string): number | null {
  const trimmed = text.trim();
  // Plain digits, or thousands grouped the way the desk shows them ("25,000"), so a copied amount works.
  if (!/^\d{1,7}$/.test(trimmed) && !/^\d{1,3}(,\d{3}){1,2}$/.test(trimmed)) return null;
  return Number(trimmed.replaceAll(",", ""));
}

/**
 * Per-field messages mirroring the server. In edit mode an untouched title (exactly as stored) is sent
 * as is, so only a control character in it is flagged (the server refuses that); stray spaces never
 * block changing the hints. `row` is the stored product when editing.
 */
export function validateDraft(draft: StoreDraft, mode: StoreMode, row?: AdminStoreProduct): StoreErrors {
  const errors: StoreErrors = {};
  if (mode === "create" && !storeProductIdPattern.test(draft.productId)) {
    errors.productId = draft.productId
      ? "Use lowercase letters, digits, dots and underscores, starting with a letter or digit, up to 100 characters."
      : "Enter the product id.";
  }
  const untouchedTitle = mode === "edit" && row !== undefined && draft.title === row.title;
  if (untouchedTitle) {
    // Sent exactly as stored, so only what the website's server refuses can fail: control characters.
    if (hasControlCharacter(draft.title)) errors.title = "This staff label has a line break or control character. Retype it on one line to save.";
  } else {
    const title = draft.title.trim();
    if (!title) errors.title = "Enter a staff label.";
    else if (hasControlCharacter(title)) errors.title = "The staff label must be on one line, with no control characters.";
    else if (codePointLength(title) > storeTitleMax) errors.title = `The staff label must be ${storeTitleMax} characters or fewer.`;
  }
  if (draft.kind === "hint_pack") {
    const hints = parseHints(draft.hints);
    if (hints === null || hints < storeHintsMin || hints > storeHintsMax)
      errors.hints = `Enter a whole number of hints from ${storeHintsMin} to ${storeHintsMax}.`;
  } else if (draft.kind === "miles_pack") {
    const miles = parseMiles(draft.miles);
    if (miles === null || miles < storeMilesMin || miles > storeMilesMax)
      errors.miles = `Enter a whole number of Miles from ${storeMilesMin} to ${storeMilesMax.toLocaleString("en-US")}.`;
  } else if (!storePassPeriods.includes(draft.passPeriod as StorePassPeriod)) {
    errors.passPeriod = "Choose a monthly or yearly term.";
  }
  return errors;
}

/**
 * The PUT body. Create (no `row`): no version, `demo: false` (the website never creates placeholder
 * products). Edit: the stored version, kind and demo flag; an unchanged title goes exactly as stored,
 * a changed one is trimmed. `{ none: true }` when an edit changes nothing. Call `validateDraft` first.
 */
export function requestBody(draft: StoreDraft, row?: AdminStoreProduct): { body: StoreProductRequest } | { none: true } {
  const title = row && draft.title === row.title ? row.title : draft.title.trim();
  const content =
    draft.kind === "hint_pack"
      ? { hints: parseHints(draft.hints) as number }
      : draft.kind === "miles_pack"
        ? { miles: parseMiles(draft.miles) as number }
        : { passPeriod: draft.passPeriod as StorePassPeriod };
  if (!row) return { body: { kind: draft.kind, title, ...content, demo: false } };
  const same =
    title === row.title &&
    ("hints" in content
      ? content.hints === row.hints
      : "miles" in content
        ? content.miles === row.miles
        : content.passPeriod === row.passPeriod);
  if (same) return { none: true };
  return { body: { version: row.version, kind: row.kind, title, ...content, demo: row.demo } };
}

export type StoreOutcome = "saved" | "reload" | "fix" | "error";

/**
 * How a write ended. `reload`: someone else changed or created the product (409 VERSION_CONFLICT or
 * PRODUCT_EXISTS) or it is gone (404 NOT_FOUND): reload and never resend. `fix`: the request itself was
 * refused (400 INVALID_REQUEST, 422 CONTENT_INVALID): keep the form open. Everything else is `error`.
 * 404 STORE_UNAVAILABLE (a mock deployment) is an error, not a reload.
 */
export function outcomeOf(status: number, code?: string | null): StoreOutcome {
  if (status === 200 || status === 201) return "saved";
  if (code === "VERSION_CONFLICT" || code === "PRODUCT_EXISTS" || code === "NOT_FOUND") return "reload";
  if (code === "INVALID_REQUEST" || code === "CONTENT_INVALID") return "fix";
  if (status === 409) return "reload";
  if (status === 422) return "fix";
  return "error";
}

/**
 * 401 / 403 / 409 when this browser's account no longer matches the session (the workspace's fence
 * handles it); otherwise null. A 403 FORBIDDEN (the role itself is missing) is shown as a message.
 */
export function blockStatusOf(status: number, code?: string | null): 401 | 403 | 409 | null {
  if (status === 401 || code === "SIGNED_OUT") return 401;
  if (code === "ACCOUNT_CHANGED") return 409;
  if (status === 403 && code !== "FORBIDDEN") return 403;
  return null;
}

/** "Try again in 12 seconds." from a Retry-After header (seconds); a generic line when it is missing. */
export function waitText(retryAfter: string | null | undefined): string {
  const seconds = retryAfter && /^\d{1,6}$/.test(retryAfter.trim()) ? Number(retryAfter.trim()) : null;
  if (seconds === null) return "Too many requests. Wait a moment and try again.";
  if (seconds <= 1) return "Too many requests. Try again in a second.";
  if (seconds < 120) return `Too many requests. Try again in ${seconds} seconds.`;
  return `Too many requests. Try again in ${Math.ceil(seconds / 60)} minutes.`;
}
