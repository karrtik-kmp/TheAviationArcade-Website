export type AccountSnapshot = {
  user: { displayName: string; emailVerified: boolean } | null;
  isStaff: boolean;
  sessionKey: string | null;
};

/** How long a confirmed account stays fresh before returning to the tab checks it again. */
export const accountRecheckMs = 60_000;

/**
 * Whether coming back to the tab should re-check the account. Focus and
 * visibility fire together, so a check already running covers both; a page
 * restored from the back/forward cache is always checked.
 */
export function shouldRecheckOnReturn({
  now,
  lastConfirmed,
  checking,
  restored = false,
}: {
  now: number;
  lastConfirmed: number | null;
  checking: boolean;
  restored?: boolean;
}): boolean {
  if (checking) return false;
  if (restored || lastConfirmed === null) return true;
  return now - lastConfirmed >= accountRecheckMs;
}

/**
 * Who a sign-in is for. Each audience has its own area. Editors sign in on
 * their own page; public sign-in retains the audience from the requested action.
 * All of them share one Firebase identity and one session cookie.
 */
export type Audience = "admin" | "photographer" | "player";

export const audiences: Record<
  Audience,
  { home: string; signIn: string; label: string }
> = {
  admin: { home: "/admin", signIn: "/admin/sign-in", label: "Editor" },
  photographer: { home: "/contribute", signIn: "/sign-in", label: "Photographer" },
  player: { home: "/play", signIn: "/sign-in", label: "Player" },
};

/** Legacy public audience hints retained for existing sign-in links. */
export const communityRoles = ["photographer", "player"] as const;
export type CommunityRole = (typeof communityRoles)[number];
export function isCommunityRole(value: unknown): value is CommunityRole {
  return communityRoles.includes(value as CommunityRole);
}

/** The audience whose area owns an app path. Anything outside a staff or photographer area is the player's. */
export function audienceFor(path: string): Audience {
  const pathname = path.split(/[?#]/)[0];
  for (const audience of ["admin", "photographer"] as const) {
    const home = audiences[audience].home;
    if (pathname === home || pathname.startsWith(`${home}/`)) return audience;
  }
  return "player";
}

const origin = "https://app.local";
const reserved = new Set([
  "/sign-in",
  "/sign-out",
  ...Object.values(audiences).map(({ signIn }) => signIn),
  "/signin-with-chatgpt",
  "/signout-with-chatgpt",
  "/callback",
]);
/** A same-site app path (no base path) that is safe to land on after an auth step, else "/". */
export function safeAccountReturn(value: string | null | undefined): string {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  )
    return "/";
  try {
    const url = new URL(value, origin);
    const path = decodeURIComponent(url.pathname);
    if (
      url.origin !== origin ||
      path.startsWith("//") ||
      /[\\\u0000-\u001f\u007f]/.test(path) ||
      reserved.has(path.replace(/\/+$/, ""))
    )
      return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
/** The sign-in page for `audience`, retaining the original action as context. */
export function signInPath(audience: Audience, returnTo?: string | null) {
  const safe = safeAccountReturn(returnTo);
  const query = new URLSearchParams();
  if (audience !== "admin") query.set("as", audience);
  if (returnTo != null && safe !== audiences[audience].home)
    query.set("return_to", safe);
  return `${audiences[audience].signIn}${query.size ? `?${query}` : ""}`;
}
/** The sign-in page for whichever area `returnTo` belongs to. */
export function accountSignInPath(returnTo = "/account") {
  const safe = safeAccountReturn(returnTo);
  return signInPath(audienceFor(safe), safe);
}
export function accountSignOutPath() {
  return "/sign-out";
}

/** What the server knows about the current visitor, minus anything secret. */
export type Principal =
  | { signedIn: false }
  | {
      signedIn: true;
      displayName: string;
      emailVerified: boolean;
      staff: boolean;
      demo: boolean;
    };

export type AccessDecision =
  | { kind: "granted"; readOnly: boolean }
  /** Not signed in: send them to this audience's sign-in page. */
  | { kind: "sign-in" }
  /** Not signed in, but the area has a public preview (the contributor landing). */
  | { kind: "guest" }
  /** Signed in, but this account can't use the area. */
  | { kind: "denied" }
  /** Signed in as an account that belongs in another area. */
  | { kind: "elsewhere"; to: string };

export function decideAccess(
  audience: Audience,
  principal: Principal,
): AccessDecision {
  if (!principal.signedIn)
    return { kind: audience === "photographer" ? "guest" : "sign-in" };
  switch (audience) {
    case "admin":
      if (principal.demo) return { kind: "granted", readOnly: true };
      return principal.staff
        ? { kind: "granted", readOnly: false }
        : { kind: "denied" };
    case "photographer":
      // The shared demo account only previews the editorial workspace.
      return principal.demo
        ? { kind: "elsewhere", to: audiences.admin.home }
        : { kind: "granted", readOnly: false };
    case "player":
      return { kind: "granted", readOnly: principal.demo };
  }
}

/** Where to land once a session cookie is set. Decided on the server so Google and email sign-in agree. */
export function afterSignIn({
  audience,
  returnTo,
  principal,
  signup = false,
}: {
  audience: Audience;
  returnTo?: string | null;
  principal: Extract<Principal, { signedIn: true }>;
  signup?: boolean;
}): string {
  if (principal.demo) return audiences.admin.home;
  const destination = returnTo == null
    ? audiences[audience].home
    : safeAccountReturn(returnTo);
  if (signup || !principal.emailVerified)
    return `/account?verify_email=1&return_to=${encodeURIComponent(destination)}`;
  return destination;
}

export function contributorPath(
  category?: string,
  game?: string,
  view?: string,
) {
  const query = new URLSearchParams();
  if (category && /^[a-z-]{1,40}$/.test(category))
    query.set("category", category);
  if (game && /^[a-z-]{1,60}$/.test(game)) query.set("game", game);
  if (view === "mine") query.set("view", "mine");
  return `/contribute${query.size ? `?${query}` : ""}`;
}
export function accountHeaders(
  sessionKey: string | null | undefined,
): Record<string, string> {
  return sessionKey ? { "X-Account-Session": sessionKey } : {};
}
