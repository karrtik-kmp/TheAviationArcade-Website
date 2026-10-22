export type AccountSnapshot = {
  user: { displayName: string; emailVerified: boolean } | null;
  isStaff: boolean;
  sessionKey: string | null;
};

const origin = "https://app.local";
const reserved = new Set([
  "/sign-in",
  "/sign-out",
  "/signin-with-chatgpt",
  "/signout-with-chatgpt",
  "/callback",
]);
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
export function accountSignInPath(returnTo = "/account") {
  return `/sign-in?return_to=${encodeURIComponent(safeAccountReturn(returnTo))}`;
}
export function accountSignOutPath() {
  return "/sign-out";
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
