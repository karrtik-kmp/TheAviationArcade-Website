/**
 * The website's API route table: every route with its audience, and the handlers. The router
 * (router.ts) has already resolved the principal, applied the account fence and the audience,
 * and checked the origin of mutations before a handler runs. Staff routes live in the Admin repo
 * (decision I-1, 2026-11-13); this table has none. Relative imports only, so the table loads under
 * `node --test`.
 */
import { HttpError, respond } from "../errors.ts";
import { localDay } from "../rules.ts";
import { TIME_ZONE } from "../plane-of-the-day.ts";
import type { FeaturedPhoto, FeaturedResponse } from "../types.ts";
import { route, type Route, type RouteContext } from "./router.ts";
import { roleRoutes } from "./role-routes.ts";
import { mediaRoutes } from "./media-routes.ts";

type PublicCtx = RouteContext<"public">;

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

/**
 * Today's Plane of the Day and the recent features, from the backend's public read (lib/plane-of-the-day.ts).
 * Keeps the old `{ featured, archive }` shape and adds `day`. `archive` is every feature after the first.
 * Images load from the CDN link directly; there is no image route on this website any more.
 */
async function featured(ctx: PublicCtx) {
  const asked = new URL(ctx.request.url).searchParams.get("timeZone") ?? "UTC";
  // A real IANA name the backend refuses (`Etc/GMT+5`, offsets) reads as UTC rather than failing the page.
  const zone = TIME_ZONE.test(asked) ? asked : "UTC";
  let day;
  try {
    day = localDay(zone);
  } catch {
    throw new HttpError(422, "Choose a valid timezone.");
  }
  const result = await ctx.planeOfTheDay(zone, day);
  if (result.state !== "ok") throw new HttpError(503, "Plane of the Day is unavailable right now. Please try again later.");
  const photos: FeaturedPhoto[] = result.features.map(({ id, date, title, aircraft, description, image }) => ({
    id,
    date,
    title,
    aircraft,
    description,
    credit: image.licence.credit,
    licenceName: image.licence.licenceName,
    licenceUrl: image.licence.licenceUrl,
    sourceUrl: image.licence.sourceUrl,
    attribution: image.licence.attributionText,
    imageUrl: image.url,
    width: image.width,
    height: image.height,
  }));
  const body: FeaturedResponse = { day: result.day, featured: photos[0] ?? null, archive: photos.slice(1) };
  return respond(body);
}

/** Literal paths come before parameter paths that could match them. */
export const routes: Route[] = [
  route({ method: "GET", path: "featured", audience: "public", run: (ctx) => featured(ctx) }),
  route({ method: "POST", path: "submissions", audience: "member", mutation: true, run: submissionsClosed }),
  route({ method: "GET", path: "submissions", audience: "member", run: submissionsClosed }),
  route({ method: "PUT", path: "submissions/:id", audience: "member", mutation: true, run: submissionsClosed }),
  route({ method: "GET", path: "submissions/:id/photo", audience: "member", run: submissionsClosed }),
  ...roleRoutes,
  ...mediaRoutes,
];
