/**
 * Browser-safe, pure helpers for the Store desk's Purchases and Player pass views (openapi 0.22.0):
 * labels, the filters-to-request-body mapping and the shared reply shape. Relative imports only, so
 * this loads under plain `node --test`. Read-only records; the website sells nothing.
 */
import { parsePlayerRef, projectOfPrincipal } from "./request/store.ts";
import type { StaffStoreGrant, StaffStorePurchase, StaffStoreSubscription } from "./request/store.ts";
import { milesLabel, waitText } from "./store-form.ts";

/** What a call to the website's store routes returned. `status` 0 means the request never got an answer. */
export type Reply = { status: number; code: string; error: string; retryAfter: string | null; body: Record<string, unknown> };

/** A date-time for staff, or the raw text when it does not parse. */
export function whenLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** Why a read failed, in words staff can act on. */
export function readFailureText(reply: Reply, fallback: string): string {
  if (reply.status === 0) return "The request could not be sent. Check your connection and try again.";
  if (reply.code === "RATE_LIMITED" || reply.status === 429) return waitText(reply.retryAfter);
  if (reply.code === "STORE_UNAVAILABLE") return "The store records aren't available on this server.";
  if (reply.code === "BACKEND_UNAVAILABLE" || reply.status === 503)
    return "The game backend is busy or couldn't be reached. Try again in a moment.";
  return reply.error || fallback;
}

export const grantTextMax = 80;

/**
 * What a purchase granted: "5 hints", "5,000 Miles", "Pass until <date>"; an unknown grant type shows its type and
 * its raw JSON, truncated, so a new backend grant never hides or breaks the row.
 */
export function grantLabel(grant: StaffStoreGrant): string {
  if (grant.type === "hints" && typeof grant.hints === "number") {
    return `${grant.hints} ${grant.hints === 1 ? "hint" : "hints"}`;
  }
  if (grant.type === "miles" && typeof grant.miles === "number") {
    return milesLabel(grant.miles);
  }
  if (grant.type === "first_class_pass" && typeof grant.until === "string") {
    return `Pass until ${whenLabel(grant.until)}`;
  }
  let raw: string;
  try {
    raw = JSON.stringify(grant) ?? "";
  } catch {
    raw = "";
  }
  const text = raw.length > grantTextMax ? `${raw.slice(0, grantTextMax)}…` : raw;
  return `${String(grant.type)}: ${text}`;
}

/** Product kind for a purchase row; a kind this site doesn't know is shown raw. */
export function kindLabel(kind: string): string {
  if (kind === "hint_pack") return "Hint pack";
  if (kind === "miles_pack") return "Miles pack";
  if (kind === "first_class_pass") return "First Class Pass";
  return kind;
}

export function storeNameLabel(store: string): string {
  if (store === "apple") return "Apple";
  if (store === "google") return "Google";
  return store;
}

/** "Fake" / "Sandbox" for non-production purchases; production carries no badge. */
export function environmentBadge(environment: string): string | null {
  if (environment === "fake") return "Fake";
  if (environment === "sandbox") return "Sandbox";
  return null;
}

const fingerprint = (value: string) => `${value}…`;

/** The store references a purchase carries, one per line ("Transaction …", "Order …", "Token fingerprint …"). */
export function referenceLines(
  purchase: Pick<
    StaffStorePurchase,
    "transactionId" | "originalTransactionId" | "orderId" | "tokenFingerprint" | "originalFingerprint"
  >,
): string[] {
  const lines: string[] = [];
  if (purchase.transactionId) lines.push(`Transaction ${purchase.transactionId}`);
  if (purchase.originalTransactionId) lines.push(`Original ${purchase.originalTransactionId}`);
  if (purchase.orderId) lines.push(`Order ${purchase.orderId}`);
  if (purchase.tokenFingerprint) lines.push(`Token fingerprint ${fingerprint(purchase.tokenFingerprint)}`);
  if (purchase.originalFingerprint) lines.push(`Original token fingerprint ${fingerprint(purchase.originalFingerprint)}`);
  return lines.length ? lines : ["—"];
}

export const referencesLabel = (purchase: Parameters<typeof referenceLines>[0]): string => referenceLines(purchase).join("; ");

const statusLabels: Record<string, string> = {
  active: "Active",
  grace: "Grace period",
  billing_retry: "Billing retry",
  on_hold: "On hold",
  expired: "Expired",
  revoked: "Revoked",
};
/** A subscription status in words; an unknown one is shown raw. */
export function subscriptionStatusLabel(status: string): string {
  return statusLabels[status] ?? status;
}

/**
 * A subscription's status as staff should read it (contract 0.21.1). `status` is the store-reported
 * state and is never re-judged against the clock, so a chain whose `expiresAt` is at or before
 * `evaluatedAt` reads as lapsed, with the store's last word in brackets. Expired and revoked chains,
 * and dates that don't parse, show the status as reported.
 */
export function subscriptionStateLabel(
  sub: Pick<StaffStoreSubscription, "status" | "expiresAt">,
  evaluatedAt: string,
): string {
  const reported = subscriptionStatusLabel(sub.status);
  if (sub.status === "expired" || sub.status === "revoked") return reported;
  const expires = Date.parse(sub.expiresAt);
  const at = Date.parse(evaluatedAt);
  if (Number.isNaN(expires) || Number.isNaN(at) || expires > at) return reported;
  return `Expired ${whenLabel(sub.expiresAt)} (store last reported: ${reported.toLowerCase()})`;
}

/** The reference a subscription is known by: Apple original transaction id or Google token fingerprint. */
export function subscriptionReference(sub: Pick<StaffStoreSubscription, "originalTransactionId" | "originalFingerprint">): string {
  if (sub.originalTransactionId) return sub.originalTransactionId;
  if (sub.originalFingerprint) return `fingerprint ${fingerprint(sub.originalFingerprint)}`;
  return "—";
}

export type PurchaseFilters = {
  player: string;
  productId: string;
  store: "" | "apple" | "google";
  transactionRef: string;
  orderId: string;
};
export const emptyFilters = (): PurchaseFilters => ({ player: "", productId: "", store: "", transactionRef: "", orderId: "" });

/** The search body: trimmed values, no empty keys, plus the cursor when paging. */
export function filtersToBody(filters: PurchaseFilters, cursor?: string | null): Record<string, string> {
  const body: Record<string, string> = {};
  for (const key of ["player", "productId", "store", "transactionRef", "orderId"] as const) {
    const value = filters[key].trim();
    if (value) body[key] = value;
  }
  if (cursor) body.cursor = cursor;
  return body;
}

/** True when no filter is set. */
export const filtersEmpty = (filters: PurchaseFilters): boolean => Object.keys(filtersToBody(filters)).length === 0;

/**
 * The id to open in Player pass for a purchase row's principal, or null when it is not a valid id.
 * The project is the principal's own, so only the shape is checked; the server still requires the
 * caller's project.
 */
export function viewPassPrincipal(principal: string): string | null {
  const project = projectOfPrincipal(principal);
  if (!project) return null;
  const parsed = parsePlayerRef(principal, project);
  return parsed.ok ? parsed.principal : null;
}
