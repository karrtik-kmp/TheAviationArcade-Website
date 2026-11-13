import { NextResponse } from "next/server";

/**
 * Headers every app response carries. The host's nginx adds HSTS only (server contract), so the app sets the
 * rest: no framing by other sites, no MIME sniffing, and a referrer that never leaks paths across origins.
 * A full content security policy is still open work. The Admin is its own repo and host (decision I-1), so
 * this site has no admin pages to keep apart.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

export function proxy() {
  return NextResponse.next({ headers: SECURITY_HEADERS });
}

export const config = {
  // Built assets and public files are served before the app.
  matcher: ["/((?!_next/|assets/|fonts/|media/|favicon\.svg).*)"],
};
