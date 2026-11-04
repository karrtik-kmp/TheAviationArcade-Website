/**
 * Role routes. The website stores no roles: each route forwards to the game backend
 * (openapi 0.15.0, ADR-0002) with the signed-in member's own Firebase ID token, checks the answer
 * against the contract and passes it on. The backend authorises every call again, so an admin
 * revoked a moment ago is refused there even if this request's principal still said admin.
 * A stale `revision` comes back as 409 VERSION_CONFLICT and is never retried. Relative imports only.
 */
import { HttpError, respond } from "../errors.ts";
import { BackendError, BackendNotConnected } from "./backend.ts";
import {
  accountPrincipalPattern,
  adminEmailPath,
  adminRoleEnvelopeSchema,
  isRoleAction,
  photographerRequestResultSchema,
  roleActionPath,
  roleRequestListSchema,
  roleStates,
  type RoleName,
} from "./roles.ts";
import { route, type RouteContext } from "./router.ts";
import type { ZodType } from "zod";

type Ctx = RouteContext<"member">;

/** While roles are mocked from the deployment's env lists, nothing can be requested or decided. */
function requireBackendRoles(ctx: Ctx) {
  if (ctx.principal.roles.status === "ok" && ctx.principal.roles.source === "mock")
    throw new HttpError(
      404,
      "Roles on this deployment are set by the Airplane Games team and can't be changed here.",
      "ROLES_MOCK",
    );
}

/** Maps a backend failure to what the website says. Never retries and never falls back. */
function backendFailure(error: unknown): never {
  if (error instanceof BackendNotConnected)
    throw new HttpError(503, "Roles are managed by the game backend, which is not connected to this website.", "BACKEND_NOT_CONNECTED");
  if (error instanceof BackendError) {
    if (error.status === 409)
      throw new HttpError(409, "Someone changed this account's role first. The list has been reloaded; decide again.", "VERSION_CONFLICT");
    if (error.status === 403)
      throw new HttpError(403, "The game backend refused this. Admin actions need an active admin role and a verified email.", "FORBIDDEN");
    if (error.status === 404) throw new HttpError(404, "That account has no such role.", "NOT_FOUND");
    if (error.status === 400) throw new HttpError(400, "The game backend rejected this request.", "INVALID_REQUEST");
    if (error.status === 401) throw new HttpError(401, "Your sign-in has expired. Sign in again.", "SIGNED_OUT");
    throw new HttpError(503, "The game backend is unavailable. Please try again.", "BACKEND_UNAVAILABLE");
  }
  throw error;
}

async function call<T>(schema: ZodType<T>, run: () => Promise<unknown>): Promise<T> {
  let answer: unknown;
  try {
    answer = await run();
  } catch (error) {
    backendFailure(error);
  }
  const parsed = schema.safeParse(answer);
  if (!parsed.success) throw new HttpError(502, "The game backend answered off its contract.", "BACKEND_CONTRACT");
  return parsed.data;
}

/** A JSON object with only the allowed keys, and a `revision` the admin read. */
async function jsonBody(ctx: Ctx, allowed: string[]) {
  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    throw new HttpError(400, "A JSON body is required.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "A JSON body is required.");
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new HttpError(400, `Only ${allowed.join(" and ")} can be sent.`);
  if (!Number.isInteger(value.revision) || (value.revision as number) < 1 || (value.revision as number) > 2147483647)
    throw new HttpError(400, "The role's revision is required.");
  return value as Record<string, unknown> & { revision: number };
}

// Control characters are refused by the backend (0.15.0); refuse them here with a clear message.
const controlCharacter = /[\u0000-\u001f\u007f]/;

/** `{ revision, note? }`: the note is trimmed, dropped when empty, at most 500 characters. */
async function decisionBody(ctx: Ctx) {
  const value = await jsonBody(ctx, ["revision", "note"]);
  if (value.note !== undefined && typeof value.note !== "string") throw new HttpError(400, "A note must be text.");
  const note = typeof value.note === "string" ? value.note.trim() : "";
  if (note.length > 500) throw new HttpError(400, "A note is at most 500 characters.");
  if (controlCharacter.test(note)) throw new HttpError(400, "A note can't contain line breaks or control characters.");
  return { revision: value.revision, ...(note ? { note } : {}) };
}

/** `{ revision, email }`: email is text (the backend trims, lowercases and checks it) or null to clear. */
async function emailBody(ctx: Ctx) {
  const value = await jsonBody(ctx, ["revision", "email"]);
  if (value.email !== null && typeof value.email !== "string") throw new HttpError(400, "Send an email address, or null to clear it.");
  const email = typeof value.email === "string" ? value.email.trim() : null;
  if (email !== null && (email.length > 320 || controlCharacter.test(email)))
    throw new HttpError(400, "That is not an email address.");
  return { revision: value.revision, email: email || null };
}

function targetPrincipal(ctx: Ctx) {
  const { principal } = ctx.params;
  // The backend's AccountPrincipal rule, checked here so no other path can be formed.
  if (!accountPrincipalPattern.test(principal)) throw new HttpError(400, "That is not an account id.");
  return principal;
}

async function listRoles(ctx: Ctx) {
  requireBackendRoles(ctx);
  const url = new URL(ctx.request.url);
  const state = url.searchParams.get("state") ?? "pending";
  if (!(roleStates as readonly string[]).includes(state)) throw new HttpError(400, "Unknown role state.");
  const query = new URLSearchParams({ state, limit: "100" });
  const cursor = url.searchParams.get("cursor");
  if (cursor) query.set("cursor", cursor);
  const list = await call(roleRequestListSchema, () =>
    ctx.backend(ctx.principal.bearer).getJson(`/v1/admin/role-requests?${query}`),
  );
  return respond({ ...list, self: ctx.principal.userId });
}

async function decide(ctx: Ctx) {
  requireBackendRoles(ctx);
  const { role, action } = ctx.params;
  if (!isRoleAction(action, role)) throw new HttpError(404, "This destination was not found.");
  const principal = targetPrincipal(ctx);
  const body = await decisionBody(ctx);
  const result = await call(adminRoleEnvelopeSchema, () =>
    ctx.backend(ctx.principal.bearer).send("POST", roleActionPath(principal, role as RoleName, action), body),
  );
  return respond(result);
}

async function editAdminEmail(ctx: Ctx) {
  requireBackendRoles(ctx);
  const principal = targetPrincipal(ctx);
  const body = await emailBody(ctx);
  const result = await call(adminRoleEnvelopeSchema, () =>
    ctx.backend(ctx.principal.bearer).send("PUT", adminEmailPath(principal), body),
  );
  return respond(result);
}

async function requestPhotographer(ctx: Ctx) {
  requireBackendRoles(ctx);
  if (!ctx.principal.emailVerified)
    throw new HttpError(403, "Verify your email address before asking for photographer access.", "EMAIL_UNVERIFIED");
  try {
    const result = await call(photographerRequestResultSchema, () =>
      ctx.backend(ctx.principal.bearer).send("POST", "/v1/me/roles/photographer", undefined),
    );
    return respond(result, result.changed ? 201 : 200);
  } catch (error) {
    // The email is verified, so a 403 here means the account is blocked from the role.
    if (error instanceof HttpError && error.code === "FORBIDDEN")
      throw new HttpError(403, "This account can't ask for photographer access.", "PHOTOGRAPHER_BLOCKED");
    throw error;
  }
}

export const roleRoutes = [
  route({
    method: "GET",
    path: "me/roles",
    audience: "member",
    run: async (ctx) => {
      if (ctx.principal.roles.status === "ok") return respond({ roles: ctx.principal.roles.roles });
      throw new HttpError(503, "Your roles could not be read from the game backend. Please try again.", "ROLES_UNAVAILABLE");
    },
  }),
  route({ method: "POST", path: "me/roles/photographer", audience: "member", mutation: true, run: requestPhotographer }),
  route({ method: "GET", path: "admin/roles", audience: "staff", run: listRoles }),
  route({ method: "PUT", path: "admin/roles/:principal/admin/email", audience: "staff", mutation: true, run: editAdminEmail }),
  route({ method: "POST", path: "admin/roles/:principal/:role/:action", audience: "staff", mutation: true, run: decide }),
];
