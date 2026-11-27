import { getPlaneOfTheDay } from "@/lib/plane-of-the-day-server";
import { dispatch } from "@/lib/request/router";
import { routes } from "@/lib/request/routes";
import { backendAs, requestPrincipal } from "@/lib/request/worker";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };

const handler = dispatch(routes, {
  principal: (request) => requestPrincipal(request.headers),
  planeOfTheDay: getPlaneOfTheDay,
  backend: (bearer) => backendAs(bearer),
});

async function handle(request: Request, context: Context) {
  const { path } = await context.params;
  return handler(request, path);
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
