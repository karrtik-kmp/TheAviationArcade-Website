/**
 * Who is making a request, decided once: the session cookie is parsed once, its Firebase ID
 * token verified once and its backend roles read once. Pages and API routes share these rules.
 * Every Worker-specific value (project, roles reader, demo UID, cookie name, verifier) arrives in
 * `deps`, so this module loads under plain `node --test`.
 */
import { matchesDemoPrincipal } from "../demo-policy.ts";
import type { FirebaseTokenIdentity } from "../firebase-verifier.ts";
import { holdsRole, noRoles, type RoleSnapshot } from "./roles.ts";

/**
 * The member's own Firebase ID token, kept for forwarding to the game backend as
 * `Authorization: Bearer`. It never serializes, so it cannot leak into page props or logs.
 */
export class Bearer {
  #token: string;
  constructor(token: string) {
    this.#token = token;
  }
  /** Only for the Authorization header of a server-to-server call. */
  reveal() {
    return this.#token;
  }
  toJSON() {
    return "[redacted]";
  }
  toString() {
    return "[redacted]";
  }
}

export type MemberPrincipal = {
  kind: "member";
  /** firebase:<projectId>:<uid> */
  userId: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  /** An active backend `admin` role, a verified email and not the demo account. */
  staff: boolean;
  /** An active backend `photographer` role, a verified email and not the demo account. */
  photographer: boolean;
  /** The caller's backend role rows, for showing request states. Grants nothing by itself. */
  roles: RoleSnapshot;
  demo: boolean;
  /** A change detector for this Site's UI, never a credential. */
  sessionKey: string;
  bearer: Bearer;
};
export type RequestPrincipal = { kind: "guest" } | MemberPrincipal;
export const guest: RequestPrincipal = { kind: "guest" };

/** Google's signing keys could not be reached: say so instead of treating the visitor as a guest. */
export class AuthUnavailable extends Error {
  constructor() {
    super("Authentication service unavailable");
  }
}
/** Returns the identity for a valid token, null for any invalid one; throws AuthUnavailable. */
export type TokenVerifier = { verify(token: string): Promise<FirebaseTokenIdentity | null> };

export type PrincipalDeps = {
  /** Null while Firebase sign-in is not configured: everyone is a guest. */
  verifier: TokenVerifier | null;
  cookieName: string;
  /**
   * The member's roles: from the game backend with their own token, or from the deployment's mock
   * lists while `ROLES_SOURCE` is not "backend". Must not throw.
   */
  roles: (bearer: Bearer, user: { email: string; emailVerified: boolean }) => Promise<RoleSnapshot>;
  projectId?: string;
  demoUid?: string;
};

export async function accountSessionKey(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`airplane-games-site-session:${userId}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Staff = an active backend `admin` role on a verified email, never the demo account. The backend
 * checks the same on every call it serves; this decides what the website shows. A role picker or
 * any client-chosen value grants nothing.
 */
export function isStaffIdentity(user: { emailVerified: boolean }, demo: boolean, roles: RoleSnapshot) {
  return !demo && user.emailVerified && holdsRole(roles, "admin");
}

/** Photographer = an active backend `photographer` role on a verified email, never the demo account. */
export function isPhotographerIdentity(user: { emailVerified: boolean }, demo: boolean, roles: RoleSnapshot) {
  return !demo && user.emailVerified && holdsRole(roles, "photographer");
}

/** The session token, or null unless exactly one cookie of that name is present. */
export function sessionToken(headers: Headers, cookieName: string) {
  const found = (headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${cookieName}=`));
  return found.length === 1 ? found[0].slice(cookieName.length + 1) : null;
}

export async function resolvePrincipal(headers: Headers, deps: PrincipalDeps): Promise<RequestPrincipal> {
  if (!deps.verifier) return guest;
  const token = sessionToken(headers, deps.cookieName);
  if (!token) return guest;
  const user = await deps.verifier.verify(token);
  if (!user) return guest;
  const demo = matchesDemoPrincipal(user.userId, deps.projectId, deps.demoUid);
  const bearer = new Bearer(token);
  // The demo account never holds a role here, so its roles are not asked for.
  const roles = demo ? noRoles : await deps.roles(bearer, user);
  return {
    kind: "member",
    userId: user.userId,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.fullName?.trim().slice(0, 120) || "Account",
    staff: isStaffIdentity(user, demo, roles),
    photographer: isPhotographerIdentity(user, demo, roles),
    roles,
    demo,
    sessionKey: await accountSessionKey(user.userId),
    bearer,
  };
}
