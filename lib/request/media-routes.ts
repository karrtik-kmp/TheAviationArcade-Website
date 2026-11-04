/**
 * Backend media routes (MEDIA_PLAN.md, openapi 0.17.0). Photographers and staff upload photos,
 * fill in licences and read their items through the game backend with their own Firebase ID
 * token; admins publish and withdraw. Only with `ROLES_SOURCE=backend`: on a mock deployment every
 * route is 404 MEDIA_UNAVAILABLE and no backend call is made. The backend authorises every call
 * again. Backend answers are checked against the contract and passed on; a failure is mapped to a
 * website code, never retried. Zod issues, inputs and URLs are never logged or echoed.
 * Relative imports only, so this loads under `node --test`.
 */
import { HttpError, respond } from "../errors.ts";
import { BackendError, BackendNotConnected } from "./backend.ts";
import {
  mediaDetailSchema,
  mediaEditRequestSchema,
  mediaErrorCodes as codes,
  mediaIdPattern,
  mediaIdempotencyKeyPattern,
  mediaItemSchema,
  mediaListSchema,
  mediaRevisionRequestSchema,
  mediaRightsRequestSchema,
  mediaStates,
  type MediaContentType,
  type MediaUploadStatement,
} from "./media.ts";
import { route, type RouteContext } from "./router.ts";
import type { ZodType } from "zod";

type Ctx = RouteContext<"member">;
type Who = "photographer" | "staff";

const MAX_BYTES = 5242880;
const MAX_JSON_BYTES = 16384;
const UPLOAD_TIMEOUT_MS = 30000;
const PAGE_LIMIT = "50";
const ownerOnlyVersions = "Only the photographer who owns this photo can add versions.";
const ownerOnlyRights = "Only the photographer who owns this photo can state its rights.";

/** In order: mock deployment, no backend, roles unreadable, then the role itself. */
function gate(ctx: Ctx, who: Who) {
  const { roles } = ctx.principal;
  if (roles.status === "ok" && roles.source === "mock")
    throw new HttpError(404, "Photo uploads are not available on this website yet.", codes.MEDIA_UNAVAILABLE);
  if (roles.status === "not-connected")
    throw new HttpError(503, "Photo uploads need the game backend, which is not connected to this website.", codes.BACKEND_NOT_CONNECTED);
  if (roles.status === "unavailable")
    throw new HttpError(503, "Your access could not be checked because the game backend is unavailable. Please try again.", codes.ROLES_UNAVAILABLE);
  if (who === "staff") {
    if (!ctx.principal.staff) throw new HttpError(403, "This is available to admins only.", codes.FORBIDDEN);
  } else if (!ctx.principal.photographer && !ctx.principal.staff)
    throw new HttpError(403, "Photo uploads need approved photographer access.", codes.PHOTOGRAPHER_REQUIRED);
}

/** Maps a backend failure to what the website says. */
function backendFailure(error: unknown, who: Who, ownerOnly?: string): never {
  if (error instanceof BackendNotConnected)
    throw new HttpError(503, "Photo uploads need the game backend, which is not connected to this website.", codes.BACKEND_NOT_CONNECTED);
  if (error instanceof BackendError) {
    const { status, code } = error;
    const unavailable = () =>
      new HttpError(503, "The game backend is unavailable. Please try again.", codes.BACKEND_UNAVAILABLE);
    if (status === 400) throw new HttpError(400, "The game backend rejected this request.", codes.INVALID_REQUEST);
    if (status === 401) throw new HttpError(401, "Your sign-in has expired. Sign in again.", codes.SIGNED_OUT);
    // Owner-only calls (new versions, rights): an admin who is not the owner is refused with 403;
    // a photographer who is not the owner gets 404 above. The backend uses the same `forbidden` code
    // for a lapsed role, so that case is misreported as "not the owner" here; it still fails closed.
    if (status === 403 && ownerOnly) throw new HttpError(403, ownerOnly, codes.FORBIDDEN);
    if (status === 403)
      throw who === "staff"
        ? new HttpError(403, "The game backend refused this. It needs an active admin role and a verified email.", codes.FORBIDDEN)
        : new HttpError(403, "The game backend refused this. It needs approved photographer access and a verified email.", codes.PHOTOGRAPHER_REQUIRED);
    if (status === 404) throw new HttpError(404, "That photo was not found.", codes.NOT_FOUND);
    if (status === 409) {
      if (code === "nothing_to_publish")
        throw new HttpError(409, "The latest version is already published.", codes.NOTHING_TO_PUBLISH);
      if (code === "rights_already_stated")
        throw new HttpError(409, "The rights for this photo have already been stated.", codes.RIGHTS_ALREADY_STATED);
      throw new HttpError(409, "Someone changed this photo first. Reload it and try again.", codes.VERSION_CONFLICT);
    }
    if (status === 413) throw new HttpError(413, "Keep each photo under 5 MB.", codes.TOO_LARGE);
    if (status === 415) throw new HttpError(415, "Choose a JPEG or PNG photo.", codes.UNSUPPORTED_TYPE);
    if (status === 422) {
      if (code === "media_invalid")
        throw new HttpError(422, "The photo could not be accepted. Choose a JPEG or PNG no larger than 4096 pixels on a side.", codes.MEDIA_INVALID);
      if (code === "idempotency_key_reused")
        throw new HttpError(422, "This upload key was already used for a different photo. Try the upload again.", codes.IDEMPOTENCY_KEY_REUSED);
      if (code === "content_invalid")
        throw new HttpError(422, "This version can't be published yet. It needs a licence name, a credit where one is required, and a rights statement.", codes.LICENCE_INCOMPLETE);
      throw new HttpError(502, "The game backend answered off its contract.", codes.BACKEND_CONTRACT);
    }
    if (status === 429)
      throw new HttpError(429, "Too many requests. Wait a moment and try again.", codes.RATE_LIMITED, undefined, error.retryAfter === undefined ? undefined : Math.ceil(error.retryAfter));
    if (status === 503 && code === "storage_unavailable")
      throw new HttpError(503, "Photo storage is unavailable. Please try again.", codes.STORAGE_UNAVAILABLE, undefined, error.retryAfter === undefined ? undefined : Math.ceil(error.retryAfter));
    throw unavailable();
  }
  throw error;
}

async function viaBackend<T>(schema: ZodType<T>, who: Who, run: () => Promise<unknown>, ownerOnly?: string): Promise<T> {
  let answer: unknown;
  try {
    answer = await run();
  } catch (error) {
    backendFailure(error, who, ownerOnly);
  }
  const parsed = schema.safeParse(answer);
  if (!parsed.success) throw new HttpError(502, "The game backend answered off its contract.", codes.BACKEND_CONTRACT);
  return parsed.data;
}

function mediaId(ctx: Ctx) {
  const { id } = ctx.params;
  if (!mediaIdPattern.test(id)) throw new HttpError(404, "That photo was not found.", codes.NOT_FOUND);
  return id;
}

const invalid = (message: string) => new HttpError(400, message, codes.INVALID_REQUEST);
const tooLarge = () => new HttpError(413, "Keep each photo under 5 MB.", codes.TOO_LARGE);

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

/** A declared length over the limit is refused before the body is read. */
function checkDeclaredLength(request: Request, limit: number) {
  const declared = request.headers.get("content-length");
  if (declared !== null && /^[0-9]{1,15}$/.test(declared.trim()) && Number(declared) > limit) throw tooLarge();
}

async function jsonBody(ctx: Ctx): Promise<unknown> {
  checkDeclaredLength(ctx.request, MAX_JSON_BYTES);
  const bytes = await readCounted(ctx.request, MAX_JSON_BYTES);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw invalid("A JSON body is required.");
  }
}

function idempotencyKey(request: Request) {
  const key = request.headers.get("Idempotency-Key");
  if (!key || !mediaIdempotencyKeyPattern.test(key)) throw invalid("The upload needs a valid retry key.");
  return key;
}

/** `X-Rights-Statement`: the browser's consent to rights wording v1. Missing or anything else is 400. */
function rightsStatement(request: Request): MediaUploadStatement {
  const value = request.headers.get("X-Rights-Statement");
  if (value === "v1_own" || value === "v1_authorised") return value;
  throw invalid("State who holds the rights to this photo.");
}

function imageType(request: Request): MediaContentType {
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type === "image/jpeg" || type === "image/png") return type;
  throw new HttpError(415, "Choose a JPEG or PNG photo.", codes.UNSUPPORTED_TYPE);
}

/** Key, rights statement, type and declared length first, then the counted body; an empty body is 400. */
async function uploadInput(request: Request) {
  const key = idempotencyKey(request);
  const statement = rightsStatement(request);
  const contentType = imageType(request);
  checkDeclaredLength(request, MAX_BYTES);
  const bytes = await readCounted(request, MAX_BYTES);
  if (!bytes.byteLength) throw invalid("Choose a photo to upload.");
  return { key, statement, contentType, bytes };
}

/** Query parameters: only the allowed names, each at most once. */
function query(ctx: Ctx, allowed: string[]) {
  const params = new URL(ctx.request.url).searchParams;
  for (const name of new Set(params.keys())) {
    if (!allowed.includes(name)) throw invalid("That request has a parameter this website does not accept.");
    if (params.getAll(name).length > 1) throw invalid("A parameter was repeated.");
  }
  return params;
}

// eslint-disable-next-line no-control-regex
const controlCharacter = /[\u0000-\u001f\u007f]/;

async function list(ctx: Ctx) {
  gate(ctx, "photographer");
  const params = query(ctx, ["state", "pending", "cursor"]);
  const out = new URLSearchParams();
  const state = params.get("state");
  const pending = params.get("pending");
  const cursor = params.get("cursor");
  if (state !== null) {
    if (!(mediaStates as readonly string[]).includes(state)) throw invalid("Unknown photo state.");
    out.set("state", state);
  }
  if (pending !== null) {
    if (pending !== "true") throw invalid("Unknown filter.");
    if (state !== null && state !== "published") throw invalid("Changes waiting only applies to published photos.");
    out.set("pending", "true");
  }
  if (cursor !== null) {
    if (cursor.length < 1 || cursor.length > 100 || controlCharacter.test(cursor)) throw invalid("That page marker is not valid.");
    out.set("cursor", cursor);
  }
  out.set("limit", PAGE_LIMIT);
  return respond(
    await viaBackend(mediaListSchema, "photographer", () =>
      ctx.backend(ctx.principal.bearer).getJson(`/v1/admin/media?${out}`),
    ),
  );
}

async function upload(ctx: Ctx, versionOf?: string) {
  gate(ctx, "photographer");
  let path = "/v1/admin/media";
  if (versionOf) {
    const params = query(ctx, ["revision"]);
    const revision = params.get("revision") ?? "";
    if (!/^[1-9][0-9]{0,9}$/.test(revision) || Number(revision) > 2147483647) throw invalid("The photo's revision is required.");
    path = `/v1/admin/media/${versionOf}/versions?revision=${revision}`;
  } else query(ctx, []);
  const { key, statement, contentType, bytes } = await uploadInput(ctx.request);
  let answer: { status: number; body: unknown };
  try {
    answer = await ctx
      .backend(ctx.principal.bearer)
      .sendWithStatus("POST", path, bytes, contentType, {
        idempotencyKey: key,
        rightsStatement: statement,
        timeoutMs: UPLOAD_TIMEOUT_MS,
      });
  } catch (error) {
    // New versions are owner only: an admin who is not the owner gets 403, a photographer 404.
    backendFailure(error, "photographer", versionOf && ctx.principal.staff ? ownerOnlyVersions : undefined);
  }
  const parsed = mediaItemSchema.safeParse(answer.body);
  if (!parsed.success || (answer.status !== 200 && answer.status !== 201))
    throw new HttpError(502, "The game backend answered off its contract.", codes.BACKEND_CONTRACT);
  return respond(parsed.data, answer.status);
}

async function detail(ctx: Ctx) {
  gate(ctx, "photographer");
  const id = mediaId(ctx);
  query(ctx, []);
  return respond(
    await viaBackend(mediaDetailSchema, "photographer", () =>
      ctx.backend(ctx.principal.bearer).getJson(`/v1/admin/media/${id}`),
    ),
  );
}

async function edit(ctx: Ctx) {
  gate(ctx, "photographer");
  const id = mediaId(ctx);
  query(ctx, []);
  const parsed = mediaEditRequestSchema.safeParse(await jsonBody(ctx));
  if (!parsed.success) throw invalid("Check the licence and description and try again.");
  // creditRequired is a staff decision; the backend enforces it too (0.17.0).
  if (!ctx.principal.staff && parsed.data.licence && "creditRequired" in parsed.data.licence)
    throw new HttpError(403, "Only the team can change whether a credit is required.", codes.CREDIT_POLICY_STAFF_ONLY);
  return respond(
    await viaBackend(mediaItemSchema, "photographer", () =>
      ctx.backend(ctx.principal.bearer).send("PATCH", `/v1/admin/media/${id}`, parsed.data),
    ),
  );
}

/** State the rights for a draft that has none (an import, or from before statements). The backend enforces the owner. */
async function stateRights(ctx: Ctx) {
  gate(ctx, "photographer");
  const id = mediaId(ctx);
  query(ctx, []);
  const parsed = mediaRightsRequestSchema.safeParse(await jsonBody(ctx));
  if (!parsed.success) throw invalid("Choose who holds the rights to this photo.");
  return respond(
    await viaBackend(
      mediaItemSchema,
      "photographer",
      () => ctx.backend(ctx.principal.bearer).send("PUT", `/v1/admin/media/${id}/rights`, parsed.data),
      ctx.principal.staff ? ownerOnlyRights : undefined,
    ),
  );
}

async function decide(ctx: Ctx, action: "publish" | "withdraw") {
  gate(ctx, "staff");
  const id = mediaId(ctx);
  query(ctx, []);
  const parsed = mediaRevisionRequestSchema.safeParse(await jsonBody(ctx));
  if (!parsed.success) throw invalid("Only the photo's revision can be sent.");
  return respond(
    await viaBackend(mediaItemSchema, "staff", () =>
      ctx.backend(ctx.principal.bearer).send("POST", `/v1/admin/media/${id}/${action}`, parsed.data),
    ),
  );
}

export const mediaRoutes = [
  route({ method: "GET", path: "media", audience: "member", run: list }),
  route({ method: "POST", path: "media", audience: "member", mutation: true, run: (ctx) => upload(ctx) }),
  route({ method: "GET", path: "media/:id", audience: "member", run: detail }),
  route({ method: "PATCH", path: "media/:id", audience: "member", mutation: true, run: edit }),
  route({
    method: "POST",
    path: "media/:id/versions",
    audience: "member",
    mutation: true,
    run: (ctx) => {
      gate(ctx, "photographer");
      return upload(ctx, mediaId(ctx));
    },
  }),
  route({ method: "PUT", path: "media/:id/rights", audience: "member", mutation: true, run: stateRights }),
  route({ method: "POST", path: "media/:id/publish", audience: "member", mutation: true, run: (ctx) => decide(ctx, "publish") }),
  route({ method: "POST", path: "media/:id/withdraw", audience: "member", mutation: true, run: (ctx) => decide(ctx, "withdraw") }),
];
