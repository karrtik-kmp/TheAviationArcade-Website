/**
 * The site surface a server process serves (`SITE_SURFACE`). One build serves either:
 * - `public`: the website (home, games, profile/account, Contribute). No admin pages or admin API.
 * - `admin`: the staff desks only (`/admin`), plus the shared API the desks call.
 * A development server with no `SITE_SURFACE` serves both (`all`). A production server refuses to start
 * without a valid value (scripts/node-server.mjs); if a request still reaches the app without one, nothing
 * is served. This is routing only: it never authorizes anything; every route keeps its own access checks.
 */
export type Surface = "public" | "admin" | "all";

export function parseSurface(value: string | undefined, development: boolean): Surface | null {
  if (value === "public" || value === "admin") return value;
  if (!value && development) return "all";
  return null;
}

const isUnder = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * The path as the app's routes will see it: percent-decoded (so `/api/%61dmin` is `/api/admin`), repeated
 * slashes collapsed, dot segments resolved and lower-cased. Null when it cannot be decoded.
 */
export function normalizeAppPath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const out: string[] = [];
  for (const segment of decoded.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") out.pop();
    else out.push(segment);
  }
  return `/${out.join("/")}`.toLowerCase();
}

/** API paths the admin desks call outside `/api/admin` (sign-in, session, media desk, editorial photos). */
function adminApiAllowed(pathname: string, method: string) {
  if (isUnder(pathname, "/api/admin")) return true;
  if (isUnder(pathname, "/api/auth")) return true;
  if (pathname === "/api/account" || pathname === "/api/health") return true;
  if (isUnder(pathname, "/api/media")) return true;
  return (method === "GET" || method === "HEAD") && /^\/api\/submissions\/[^/]+\/photo$/.test(pathname);
}

/**
 * Whether this surface serves the path. `rawPathname` is the app path (no base-path prefix) as requested,
 * possibly still percent-encoded; it is normalized first, and a path that cannot be decoded is not served.
 */
export function surfaceServes(surface: Surface | null, rawPathname: string, method: string): boolean {
  if (surface === "all") return true;
  if (surface === null) return false;
  const pathname = normalizeAppPath(rawPathname);
  if (pathname === null) return false;
  const admin = isUnder(pathname, "/admin") || isUnder(pathname, "/api/admin");
  if (surface === "public") return !admin;
  if (isUnder(pathname, "/api")) return adminApiAllowed(pathname, method);
  // Sign-out is shared: the account menu and access gates on the admin desks link to /sign-out.
  return isUnder(pathname, "/admin") || pathname === "/sign-out";
}
