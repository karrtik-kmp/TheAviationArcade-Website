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
 * Who a sign-in is for on this website. Each audience has its own area; sign-in retains the audience
 * from the requested action. Editors sign in on the Admin, its own repo and host (decision I-1).
 */
export type Audience = "photographer" | "player";

export const audiences: Record<
  Audience,
  { home: string; signIn: string; label: string }
> = {
  photographer: { home: "/contribute", signIn: "/sign-in", label: "Photographer" },
  player: { home: "/play", signIn: "/sign-in", label: "Player" },
};

/** Legacy public audience hints retained for existing sign-in links. */
export const communityRoles = ["photographer", "player"] as const;
export type CommunityRole = (typeof communityRoles)[number];
export function isCommunityRole(value: unknown): value is CommunityRole {
  return communityRoles.includes(value as CommunityRole);
}

/** The audience whose area owns an app path. Anything outside the photographer area is the player's. */
export function audienceFor(path: string): Audience {
  const pathname = path.split(/[?#]/)[0];
  const home = audiences.photographer.home;
  return pathname === home || pathname.startsWith(`${home}/`) ? "photographer" : "player";
}

const origin = "https://app.local";
const reserved = new Set([
  "/sign-in",
  "/sign-out",
  "/admin/sign-in",
  ...Object.values(audiences).map(({ signIn }) => signIn),
  "/signin-with-chatgpt",
  "/signout-with-chatgpt",
  "/callback",
]);
/**
 * The Admin's paths. The website has none since decision I-1 (the Admin is its own repo and host), so an old
 * `/sign-in?return_to=/admin…` link must not land a signed-in editor on a 404.
 */
const retiredAdmin = (path: string) => path === "/admin" || path.startsWith("/admin/");

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
      reserved.has(path.replace(/\/+$/, "")) ||
      retiredAdmin(path.replace(/\/+$/, ""))
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
  query.set("as", audience);
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
    case "photographer":
      // The shared demo account can't send photos; it previews the player area instead.
      return principal.demo
        ? { kind: "elsewhere", to: audiences.player.home }
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
  if (principal.demo) return audiences.player.home;
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
