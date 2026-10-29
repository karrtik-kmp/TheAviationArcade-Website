/**
 * The API router. Each route declares its audience; dispatch runs the same checks in a fixed order
 * for every request:
 *   1. the principal is resolved once, and only for routes that are not public;
 *   2. a guest gets 401 and the demo account 403 DEMO_ACCOUNT on any non-public route;
 *   3. the account fence: an X-Account-Session header that differs from the session gets 409;
 *   4. a non-staff member on a staff route gets 403;
 *   5. a mutation from another origin gets 403;
 *   6. the handler runs. "owner" routes check the row owner themselves.
 * An unknown path under admin/ is checked as a staff route, and one under submissions/ as a member
 * route, before its 404, as before. Relative imports only, so the table runs under `node --test`.
 */
import { HttpError, failure, sameOrigin } from "../errors.ts";
import type { EditorialStore } from "../editorial/store.ts";
import type { ContentStore } from "../editorial/content.ts";
import type { PhotoStorage } from "../photo-storage.ts";
import { AuthUnavailable, type MemberPrincipal, type RequestPrincipal } from "./principal.ts";

export type Audience = "public" | "member" | "owner" | "staff";

export type RouteDeps = {
  principal: (request: Request) => Promise<RequestPrincipal>;
  /** Lazy, so a missing binding only fails the routes that need it (503). */
  db: () => D1Database;
  photos: () => PhotoStorage;
  editorial: () => EditorialStore;
  content: () => ContentStore;
  references: () => Promise<unknown>;
};
export type RouteContext<A extends Audience = Audience> = Omit<RouteDeps, "principal"> & {
  request: Request;
  params: Record<string, string>;
  principal: A extends "public" ? RequestPrincipal : MemberPrincipal;
};
export type Route<A extends Audience = Audience> = {
  method: "GET" | "POST" | "PUT" | "PATCH";
  /** Segments separated by "/"; ":name" matches one segment. */
  path: string;
  audience: A;
  mutation?: boolean;
  run(ctx: RouteContext<A>): Promise<Response>;
};
/** Keeps each route's audience and its handler's principal type together. */
export const route = <A extends Audience>(r: Route<A>) => r as unknown as Route;

export function match(pattern: string, path: string[]): Record<string, string> | null {
  const parts = pattern.split("/");
  if (parts.length !== path.length) return null;
  const params: Record<string, string> = {};
  for (const [i, part] of parts.entries()) {
    if (part.startsWith(":")) params[part.slice(1)] = path[i];
    else if (part !== path[i]) return null;
  }
  return params;
}

function implicitAudience(path: string[]): Audience | null {
  return path[0] === "admin" ? "staff" : path[0] === "submissions" ? "member" : null;
}

async function admit(audience: Audience, request: Request, deps: RouteDeps): Promise<RequestPrincipal> {
  if (audience === "public") return { kind: "guest" };
  let principal: RequestPrincipal;
  try {
    principal = await deps.principal(request);
  } catch (error) {
    if (error instanceof AuthUnavailable)
      throw new HttpError(503, "Sign-in could not be checked. Please try again.");
    throw error;
  }
  if (principal.kind === "guest") throw new HttpError(401, "Sign in to continue.");
  if (principal.demo)
    throw new HttpError(403, "The shared demo account can only view sample content.", "DEMO_ACCOUNT");
  // Optional UI fence: reject an operation started under another account. It grants no access.
  const expected = request.headers.get("X-Account-Session");
  if (expected && expected !== principal.sessionKey)
    throw new HttpError(409, "Your signed-in account changed. Reload before continuing.", "ACCOUNT_CHANGED");
  if (audience === "staff" && !principal.staff)
    throw new HttpError(403, "This area is available to authorized editors only.");
  return principal;
}

export function dispatch(routes: Route[], deps: RouteDeps) {
  return async (request: Request, path: string[]): Promise<Response> => {
    try {
      for (const r of routes) {
        if (r.method !== request.method) continue;
        const params = match(r.path, path);
        if (!params) continue;
        const principal = await admit(r.audience, request, deps);
        if (r.mutation) sameOrigin(request);
        const { principal: _resolve, ...rest } = deps;
        return await r.run({ ...rest, request, params, principal } as RouteContext);
      }
      const implicit = implicitAudience(path);
      if (implicit) await admit(implicit, request, deps);
      throw new HttpError(404, "This destination was not found.");
    } catch (error) {
      return failure(error);
    }
  };
}
