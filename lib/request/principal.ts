/**
 * Who is making a request, decided once: the session cookie is parsed once and its Firebase ID
 * token verified once. Pages and API routes share these rules. Every Worker-specific value
 * (project, staff allowlist, demo UID, cookie name, verifier) arrives in `deps`, so this module
 * loads under plain `node --test`.
 */
import { matchesDemoPrincipal } from "../demo-policy.ts";
import type { FirebaseTokenIdentity } from "../firebase-verifier.ts";

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
  staff: boolean;
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
  staffEmails: string[];
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

export function parseStaffEmails(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Staff = a verified email on the server allowlist, never the demo account. A role picker grants nothing. */
export function isStaffIdentity(
  user: { email: string; emailVerified: boolean },
  demo: boolean,
  staffEmails: string[],
) {
  return !demo && user.emailVerified && staffEmails.includes(user.email.toLowerCase());
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
  return {
    kind: "member",
    userId: user.userId,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.fullName?.trim().slice(0, 120) || "Account",
    staff: isStaffIdentity(user, demo, deps.staffEmails),
    demo,
    sessionKey: await accountSessionKey(user.userId),
    bearer: new Bearer(token),
  };
}
