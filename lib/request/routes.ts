/**
 * The website's API route table: every route with its audience, and the handlers. The router
 * (router.ts) has already resolved the principal, applied the account fence and the audience,
 * and checked the origin of mutations before a handler runs. Staff routes live in the Admin repo
 * (decision I-1, 2026-11-13); this table has none. Relative imports only, so the table loads under
 * `node --test`.
 */
import { HttpError, respond } from "../errors.ts";
import { localDay } from "../rules.ts";
import type { EditorialData } from "../types.ts";
import { route, type Route, type RouteContext } from "./router.ts";
import { roleRoutes } from "./role-routes.ts";
import { mediaRoutes } from "./media-routes.ts";

type PublicCtx = RouteContext<"public">;

const privatePhoto = (body: ReadableStream | null, mime: string) =>
  new Response(body, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });

/**
 * Photographer submissions are stored in the backend and Bunny, not this website's database
 * (PROJECT_STATE 11-04, D-2 amended). The old proposal routes take nothing and show nothing, in every
 * mode. Existing proposals reach the backend through `npm run media:export`, not through these routes.
 */
async function submissionsClosed(): Promise<Response> {
  throw new HttpError(
    404,
    "Photo proposals on this website are closed. Signed-in photographers upload in the photo area.",
    "SUBMISSIONS_CLOSED",
  );
}

/** Today's Plane of the Day and its archive, or one published photograph. */
async function featured(ctx: PublicCtx, photoId?: string) {
  const zone = new URL(ctx.request.url).searchParams.get("timeZone") ?? "UTC";
  let day;
  try {
    day = localDay(zone);
  } catch {
    throw new HttpError(422, "Choose a valid timezone.");
  }
  const eligible = await ctx.content().featured(day);
  if (photoId) {
    const row = eligible.find((r) => r.record.id === photoId);
    if (!row) throw new HttpError(404, "Photograph not published.");
    const object = await ctx.photos().get(row.imageKey);
    if (!object) throw new HttpError(404, "Photograph unavailable.");
    return privatePhoto(object.body, row.imageMime);
  }
  const photos = eligible.map(({ record }) => {
    const data: EditorialData = record.data;
    return {
      id: record.id,
      title: data.title,
      aircraft: data.aircraft,
      photographer: data.photographer,
      credit: data.credit,
      description: data.description,
      date: record.dateKey,
      imageUrl: `/api/photos/${record.id}?timeZone=${encodeURIComponent(zone)}`,
    };
  });
  return respond({ featured: photos[0] ?? null, archive: photos });
}

/** Literal paths come before parameter paths that could match them. */
export const routes: Route[] = [
  route({ method: "GET", path: "featured", audience: "public", run: (ctx) => featured(ctx) }),
  route({ method: "GET", path: "photos/:id", audience: "public", run: (ctx) => featured(ctx, ctx.params.id) }),
  route({ method: "POST", path: "submissions", audience: "member", mutation: true, run: submissionsClosed }),
  route({ method: "GET", path: "submissions", audience: "member", run: submissionsClosed }),
  route({ method: "PUT", path: "submissions/:id", audience: "member", mutation: true, run: submissionsClosed }),
  route({ method: "GET", path: "submissions/:id/photo", audience: "member", run: submissionsClosed }),
  ...roleRoutes,
  ...mediaRoutes,
];
