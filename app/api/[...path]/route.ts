import { database, bucket } from "@/lib/server";
import { d1EditorialStore } from "@/lib/editorial/d1-store";
import { d1ContentStore } from "@/lib/editorial/content-d1";
import { dispatch } from "@/lib/request/router";
import { routes } from "@/lib/request/routes";
import { backendAs, requestPrincipal } from "@/lib/request/worker";
import { setting } from "@/lib/settings";
import { parseSurface, surfaceServes } from "@/lib/surface";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };

const handler = dispatch(routes, {
  principal: (request) => requestPrincipal(request.headers),
  db: database,
  photos: bucket,
  editorial: () => d1EditorialStore(database()),
  content: () => d1ContentStore(database()),
  references: async () => (await import("@/data/reference-airports.json")).default,
  backend: (bearer) => backendAs(bearer),
});

async function handle(request: Request, context: Context) {
  const { path } = await context.params;
  // Second check on the decoded segments the router dispatches on (proxy.ts checks the request path).
  const surface = parseSurface(setting("SITE_SURFACE"), import.meta.env.DEV === true);
  if (!surfaceServes(surface, `/api/${path.map(encodeURIComponent).join("/")}`, request.method))
    return Response.json({ error: "Not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return handler(request, path);
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
