/**
 * Staff store views on the game backend (openapi 0.21.0), read only: the purchase list and one
 * player's First Class Pass. Same gate as the catalog routes (store-routes.ts). The search is a POST
 * so a store purchase token typed as a filter travels in a body, not in this website's request URL;
 * the backend call is a GET whose URL is built here and never logged. A bare uid is turned into a
 * principal of the caller's own Firebase project, and another project's principal is refused before
 * any backend call. Zod issues, inputs, filters and URLs are never logged or echoed. Relative imports only.
 */
import { HttpError, respond } from "../errors.ts";
import { BackendError, BackendNotConnected } from "./backend.ts";
import { gate, invalid, jsonBody, noQuery } from "./store-routes.ts";
import {
  parsePlayerRef,
  projectOfPrincipal,
  purchaseSearchRequestSchema,
  staffEntitlementsSchema,
  staffStorePurchaseListSchema,
  storeErrorCodes as codes,
} from "./store.ts";
import { route, type RouteContext } from "./router.ts";
import type { ZodType } from "zod";

type Ctx = RouteContext<"member">;

/** The page size the website asks for; the backend's own default, stated so the query string is exact. */
const PAGE_LIMIT = 50;

const contract = () => new HttpError(502, "The game backend answered off its contract.", codes.BACKEND_CONTRACT);

/** `cursorSent`: a 400 then means the cursor no longer fits, not that the filters are bad. */
function backendFailure(error: unknown, kind: "search" | "player", cursorSent = false): never {
  if (error instanceof BackendNotConnected)
    throw new HttpError(503, "The store views need the game backend, which is not connected to this website.", codes.BACKEND_NOT_CONNECTED);
  if (error instanceof BackendError) {
    const { status, code } = error;
    if (status === 400)
      throw cursorSent
        ? new HttpError(400, "That page no longer matches this search. Start again from the first page.", codes.CURSOR_STALE)
        : new HttpError(400, "The game backend rejected this request.", codes.INVALID_REQUEST);
    if (status === 401) throw new HttpError(401, "Your sign-in has expired. Sign in again.", codes.SIGNED_OUT);
    if (status === 403)
      throw new HttpError(403, "The game backend refused this. It needs an active admin role and a verified email.", codes.FORBIDDEN);
    if (status === 404 && kind === "player" && code === "player_not_found")
      throw new HttpError(404, "No player with that id (or the account was deleted).", codes.PLAYER_NOT_FOUND);
    if (status === 429)
      throw new HttpError(429, "Too many requests. Wait a moment and try again.", codes.RATE_LIMITED, undefined, error.retryAfter === undefined ? undefined : Math.ceil(error.retryAfter));
    if (status >= 400 && status < 500) throw contract();
    throw new HttpError(503, "The game backend is unavailable. Please try again.", codes.BACKEND_UNAVAILABLE);
  }
  throw error;
}

/** The caller's own Firebase project, from their principal. Fails closed when it cannot be read. */
function callerProject(ctx: Ctx) {
  const project = projectOfPrincipal(ctx.principal.userId);
  if (project === null) throw new HttpError(403, "Your account could not be matched to this Firebase project.", codes.FORBIDDEN);
  return project;
}

/** A uid or principal typed by staff → the principal of the caller's project, or 400 with no backend call. */
function playerPrincipal(ctx: Ctx, input: string) {
  const parsed = parsePlayerRef(input, callerProject(ctx));
  if (parsed.ok) return parsed.principal;
  throw invalid(parsed.reason === "other_project" ? "That id belongs to another Firebase project." : "That is not a valid player id.");
}

async function viaBackend<T>(schema: ZodType<T>, kind: "search" | "player", cursorSent: boolean, run: () => Promise<unknown>) {
  let answer: unknown;
  try {
    answer = await run();
  } catch (error) {
    backendFailure(error, kind, cursorSent);
  }
  const parsed = schema.safeParse(answer);
  if (!parsed.success) throw contract();
  return parsed.data;
}

async function search(ctx: Ctx) {
  gate(ctx);
  noQuery(ctx);
  const parsed = purchaseSearchRequestSchema.safeParse(await jsonBody(ctx));
  if (!parsed.success) throw invalid("Check the filters and try again.");
  const filters = parsed.data;
  const query = new URLSearchParams();
  if (filters.player !== undefined) query.set("player", playerPrincipal(ctx, filters.player));
  if (filters.productId !== undefined) query.set("productId", filters.productId);
  if (filters.store !== undefined) query.set("store", filters.store);
  if (filters.transactionRef !== undefined) query.set("transactionRef", filters.transactionRef);
  if (filters.orderId !== undefined) query.set("orderId", filters.orderId);
  if (filters.cursor !== undefined) query.set("cursor", filters.cursor);
  query.set("limit", String(PAGE_LIMIT));
  return respond(
    await viaBackend(staffStorePurchaseListSchema, "search", filters.cursor !== undefined, () =>
      ctx.backend(ctx.principal.bearer).getJson(`/v1/admin/store/purchases?${query.toString()}`),
    ),
  );
}

async function entitlements(ctx: Ctx) {
  gate(ctx);
  noQuery(ctx);
  // The framework has already decoded the segment once; it is validated as is and encoded once for the backend path.
  const principal = playerPrincipal(ctx, ctx.params.player ?? "");
  return respond(
    await viaBackend(staffEntitlementsSchema, "player", false, () =>
      ctx.backend(ctx.principal.bearer).getJson(`/v1/admin/store/players/${encodeURIComponent(principal)}/entitlements`),
    ),
  );
}

export const storePurchaseRoutes = [
  route({ method: "POST", path: "admin/store/purchases/search", audience: "staff", mutation: true, run: search }),
  route({ method: "GET", path: "admin/store/players/:player/entitlements", audience: "staff", run: entitlements }),
];
