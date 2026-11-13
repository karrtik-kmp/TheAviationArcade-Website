/**
 * Member role routes: read your own roles and ask for photographer access. The website stores no
 * roles: each route forwards to the game backend (openapi 0.15.0, ADR-0002) with the signed-in
 * member's own Firebase ID token and checks the answer against the contract. Deciding roles is an
 * Admin desk and lives in the Admin repo. Relative imports only.
 */
import { HttpError, respond } from "../errors.ts";
import { BackendError, BackendNotConnected } from "./backend.ts";
import { photographerRequestResultSchema } from "./roles.ts";
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
];
