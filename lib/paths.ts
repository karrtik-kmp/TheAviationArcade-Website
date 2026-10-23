/**
 * The site's URL prefix, from `basePath` in next.config ("" when served at the
 * root). Vinext defines this for both the server and the browser bundles.
 *
 * App paths ("/admin", "/api/account") never include the prefix. Anything that
 * leaves React's router — a native <a>, fetch, location.assign, an <img src> —
 * goes through `sitePath` so the site works under any prefix.
 */
export const BASE_PATH = (process.env.__NEXT_ROUTER_BASEPATH ?? "").replace(
  /\/+$/,
  "",
);

/**
 * App path → browser URL path. Input must not already contain the URL prefix;
 * use appPath at browser-URL boundaries. A prefix may equal an app route name.
 * Leaves external, protocol-relative and hash links alone.
 */
export function sitePath(appPath: string): string {
  if (!appPath.startsWith("/") || appPath.startsWith("//")) return appPath;
  if (!BASE_PATH) return appPath;
  return appPath === "/" ? BASE_PATH : `${BASE_PATH}${appPath}`;
}

/** Browser URL path → app path. */
export function appPath(browserPath: string): string {
  if (!BASE_PATH) return browserPath;
  if (browserPath === BASE_PATH) return "/";
  return browserPath.startsWith(`${BASE_PATH}/`)
    ? browserPath.slice(BASE_PATH.length)
    : browserPath;
}

/** Full-page navigation that also escapes an embedding iframe (the hosted preview). */
export function navigateTo(path: string, { replace = false } = {}) {
  const target = window.top && window.top !== window ? window.top : window;
  const url = sitePath(path);
  if (replace) target.location.replace(url);
  else target.location.assign(url);
}
