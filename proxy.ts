import { NextResponse, type NextRequest } from "next/server";
import { parseSurface, surfaceServes } from "@/lib/surface";

/**
 * Headers every app response carries. The host's nginx adds HSTS only (server contract), so the app sets the
 * rest: no framing by other sites (staff actions must not be clickjackable), no MIME sniffing, and a referrer
 * that never leaks paths across origins. A full content security policy is still open work.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

/** Answers 404 for paths that belong to the other surface (`SITE_SURFACE`, lib/surface.ts). */
export function proxy(request: NextRequest) {
  const surface = parseSurface(process.env.SITE_SURFACE, import.meta.env.DEV === true);
  if (surfaceServes(surface, request.nextUrl.pathname, request.method))
    return NextResponse.next({ headers: SECURITY_HEADERS });
  return new NextResponse("Not found", {
    status: 404,
    headers: { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const config = {
  // Built assets and public files are served before the app and need no surface check.
  matcher: ["/((?!_next/|assets/|fonts/|media/|favicon\\.svg).*)"],
};
