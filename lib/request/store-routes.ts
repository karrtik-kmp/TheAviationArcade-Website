/**
 * Backend store catalog routes (openapi 0.22.0). Admins read the catalog, create and edit products
 * and retire or restore them through the game backend with their own Firebase ID token. The website
 * sells nothing and records no prices. Only with `ROLES_SOURCE=backend`: on a mock deployment every
 * route is 404 STORE_UNAVAILABLE and no backend call is made (the backend authorises with its own
 * roles, which mock roles never consulted). Backend answers are checked against the contract and
 * passed on; a failure is mapped to a website code, never retried and never resent with another
 * version. Zod issues, inputs and URLs are never logged or echoed. Relative imports only.
 */
import { HttpError, respond } from "../errors.ts";
import { BackendError, BackendNotConnected } from "./backend.ts";
import {
  adminStoreProductListSchema,
  adminStoreProductSchema,
  storeErrorCodes as codes,
  storeProductIdPattern,
  storeProductRequestSchema,
  storeVersionRequestSchema,
} from "./store.ts";
import { route, type RouteContext } from "./router.ts";
import type { ZodType } from "zod";

type Ctx = RouteContext<"member">;

const MAX_JSON_BYTES = 4096;

export function gate(ctx: Ctx) {
  const { roles } = ctx.principal;
  if (roles.status === "ok" && roles.source === "mock")
    throw new HttpError(404, "The store catalog is not available on this website yet.", codes.STORE_UNAVAILABLE);
  if (roles.status === "not-connected")
    throw new HttpError(503, "The store catalog needs the game backend, which is not connected to this website.", codes.BACKEND_NOT_CONNECTED);
  if (roles.status === "unavailable")
    throw new HttpError(503, "Your access could not be checked because the game backend is unavailable. Please try again.", codes.ROLES_UNAVAILABLE);
  if (!ctx.principal.staff) throw new HttpError(403, "This is available to admins only.", codes.FORBIDDEN);
}

/** `hadVersion`: the request carried a version (an edit), which decides what a 409 means. */
function backendFailure(error: unknown, hadVersion: boolean): never {
  if (error instanceof BackendNotConnected)
    throw new HttpError(503, "The store catalog needs the game backend, which is not connected to this website.", codes.BACKEND_NOT_CONNECTED);
  if (error instanceof BackendError) {
    const { status, code } = error;
    const contract = () => new HttpError(502, "The game backend answered off its contract.", codes.BACKEND_CONTRACT);
    if (status === 400) throw new HttpError(400, "The game backend rejected this request.", codes.INVALID_REQUEST);
    if (status === 401) throw new HttpError(401, "Your sign-in has expired. Sign in again.", codes.SIGNED_OUT);
    if (status === 403)
      throw new HttpError(403, "The game backend refused this. It needs an active admin role and a verified email.", codes.FORBIDDEN);
    if (status === 404) throw new HttpError(404, "That product was not found.", codes.NOT_FOUND);
    if (status === 409)
      throw hadVersion
        ? new HttpError(409, "Someone changed this product first. Reload the list and decide again.", codes.VERSION_CONFLICT)
        : new HttpError(409, "A product with this id already exists.", codes.PRODUCT_EXISTS);
    if (status === 413) throw new HttpError(413, "That request is too large.", codes.TOO_LARGE);
    if (status === 422) {
      if (code === "content_invalid")
        throw new HttpError(
          422,
          "The game backend refused these values. A product's kind and placeholder setting are fixed once it exists, a hint pack needs 1 to 1000 hints, a Miles pack 1 to 1,000,000 Miles, a First Class Pass needs a term, and placeholder products can't be created in production.",
          codes.CONTENT_INVALID,
        );
      throw contract();
    }
    if (status === 429)
      throw new HttpError(429, "Too many requests. Wait a moment and try again.", codes.RATE_LIMITED, undefined, error.retryAfter === undefined ? undefined : Math.ceil(error.retryAfter));
    if (status >= 400 && status < 500) throw contract();
    throw new HttpError(503, "The game backend is unavailable. Please try again.", codes.BACKEND_UNAVAILABLE);
  }
  throw error;
}

async function viaBackend<T>(schema: ZodType<T>, run: () => Promise<unknown>): Promise<T> {
  let answer: unknown;
  try {
    answer = await run();
  } catch (error) {
    backendFailure(error, true);
  }
  const parsed = schema.safeParse(answer);
  if (!parsed.success) throw new HttpError(502, "The game backend answered off its contract.", codes.BACKEND_CONTRACT);
  return parsed.data;
}

export const invalid = (message: string) => new HttpError(400, message, codes.INVALID_REQUEST);
const tooLarge = () => new HttpError(413, "That request is too large.", codes.TOO_LARGE);

/** Reads the body, cancelling as soon as it passes `limit`; a lying Content-Length cannot get past this. */
async function readCounted(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

export async function jsonBody(ctx: Ctx): Promise<unknown> {
  const declared = ctx.request.headers.get("content-length");
  if (declared !== null && /^[0-9]{1,15}$/.test(declared.trim()) && Number(declared) > MAX_JSON_BYTES) throw tooLarge();
  const bytes = await readCounted(ctx.request, MAX_JSON_BYTES);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw invalid("A JSON body is required.");
  }
}

/** None of these routes takes a query parameter. */
export function noQuery(ctx: Ctx) {
  if ([...new URL(ctx.request.url).searchParams.keys()].length)
    throw invalid("That request has a parameter this website does not accept.");
}

/** A malformed id never forms a backend path: PUT says 400, retire and restore say 404. */
function productId(ctx: Ctx, onBad: "invalid" | "missing") {
  const { id } = ctx.params;
  if (!storeProductIdPattern.test(id))
    throw onBad === "invalid" ? invalid("That is not a valid product id.") : new HttpError(404, "That product was not found.", codes.NOT_FOUND);
  return id;
}

async function list(ctx: Ctx) {
  gate(ctx);
  noQuery(ctx);
  return respond(
    await viaBackend(adminStoreProductListSchema, () => ctx.backend(ctx.principal.bearer).getJson("/v1/admin/store/products")),
  );
}

async function put(ctx: Ctx) {
  gate(ctx);
  const id = productId(ctx, "invalid");
  noQuery(ctx);
  const parsed = storeProductRequestSchema.safeParse(await jsonBody(ctx));
  if (!parsed.success) throw invalid("Check the product details and try again.");
  // The website never creates placeholder products; the backend seed does.
  if (parsed.data.version === undefined && parsed.data.demo) throw invalid("The website does not create placeholder products.");
  const hadVersion = parsed.data.version !== undefined;
  let answer: { status: number; body: unknown };
  try {
    answer = await ctx.backend(ctx.principal.bearer).sendWithStatus("PUT", `/v1/admin/store/products/${id}`, parsed.data);
  } catch (error) {
    backendFailure(error, hadVersion);
  }
  const product = adminStoreProductSchema.safeParse(answer.body);
  if (!product.success || (answer.status !== 200 && answer.status !== 201))
    throw new HttpError(502, "The game backend answered off its contract.", codes.BACKEND_CONTRACT);
  return respond(product.data, answer.status);
}

async function decide(ctx: Ctx, action: "retire" | "restore") {
  gate(ctx);
  const id = productId(ctx, "missing");
  noQuery(ctx);
  const parsed = storeVersionRequestSchema.safeParse(await jsonBody(ctx));
  if (!parsed.success) throw invalid("Only the product's version can be sent.");
  return respond(
    await viaBackend(adminStoreProductSchema, () =>
      ctx.backend(ctx.principal.bearer).send("POST", `/v1/admin/store/products/${id}/${action}`, parsed.data),
    ),
  );
}

export const storeRoutes = [
  route({ method: "GET", path: "admin/store/products", audience: "staff", run: list }),
  route({ method: "PUT", path: "admin/store/products/:id", audience: "staff", mutation: true, run: put }),
  route({ method: "POST", path: "admin/store/products/:id/retire", audience: "staff", mutation: true, run: (ctx) => decide(ctx, "retire") }),
  route({ method: "POST", path: "admin/store/products/:id/restore", audience: "staff", mutation: true, run: (ctx) => decide(ctx, "restore") }),
];
