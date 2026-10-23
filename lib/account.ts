export type AccountSnapshot = {
  user: { displayName: string; emailVerified: boolean } | null;
  isStaff: boolean;
  sessionKey: string | null;
};

/**
 * Who a sign-in is for. Each audience has its own area and its own sign-in
 * page; they all share one Firebase identity and one session cookie.
 */
export type Audience = "admin" | "photographer" | "player";

export const audiences: Record<
  Audience,
  { home: string; signIn: string; label: string }
> = {
  admin: { home: "/admin", signIn: "/admin/sign-in", label: "Editor" },
  photographer: {
    home: "/contribute",
    signIn: "/contribute/sign-in",
    label: "Photographer",
  },
  player: { home: "/play", signIn: "/play/sign-in", label: "Player" },
};

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
/** The sign-in page for whichever area `returnTo` belongs to. */
export function accountSignInPath(returnTo = "/account") {
  const safe = safeAccountReturn(returnTo);
  const { signIn, home } = audiences[audienceFor(safe)];
  return safe === home
    ? signIn
    : `${signIn}?return_to=${encodeURIComponent(safe)}`;
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
  const safe = safeAccountReturn(returnTo);
  const destination = safe === "/" ? audiences[audience].home : safe;
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
