import { database, bucket } from "@/lib/server";
import { d1EditorialStore } from "@/lib/editorial/d1-store";
import { d1ContentStore } from "@/lib/editorial/content-d1";
import { dispatch } from "@/lib/request/router";
import { routes } from "@/lib/request/routes";
import { requestPrincipal } from "@/lib/request/worker";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };

const handler = dispatch(routes, {
  principal: (request) => requestPrincipal(request.headers),
  db: database,
  photos: bucket,
  editorial: () => d1EditorialStore(database()),
  content: () => d1ContentStore(database()),
  references: async () => (await import("@/data/reference-airports.json")).default,
});

async function handle(request: Request, context: Context) {
  const { path } = await context.params;
  return handler(request, path);
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
