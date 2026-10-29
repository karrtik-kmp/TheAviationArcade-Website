/**
 * The API route table: every route with its audience, and the handlers. The router
 * (router.ts) has already resolved the principal, applied the account fence and the audience,
 * and checked the origin of mutations before a handler runs. Handlers parse the request and call
 * a store: photographer submissions (lib/submissions/d1.ts), the Aircraft Identifier and Plane of
 * the Day desks (ContentStore) and the Military desk (EditorialStore). Relative imports only, so
 * the table loads under `node --test`.
 */
import { HttpError, limitedForm, respond } from "../errors.ts";
import { submissionSchema, imageInfo, MAX_UPLOAD_BYTES, localDay } from "../rules.ts";
import {
  EditorialError,
  packageOf,
  packagesOf,
  release,
  type LiveState,
} from "../editorial/store.ts";
import {
  allSubmissions,
  checkRevisable,
  findSubmission,
  loadDemoData,
  ownSubmissions,
  reviewSubmission,
  writeSubmission,
  type NewImage,
} from "../submissions/d1.ts";
import type { EditorialData } from "../types.ts";
import { route, type Route, type RouteContext } from "./router.ts";

type Ctx = RouteContext<"member">;
type PublicCtx = RouteContext<"public">;

async function bodyJson(request: Request) {
  const raw = await request.text();
  if (raw.length > 24000) throw new HttpError(413, "The form is too large.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "The request is not valid JSON.");
  }
}
/** Store refusals become HTTP errors with the same words; a release refusal keeps its reasons. */
async function editorialCall<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof EditorialError)
      throw new HttpError(error.status, error.message, undefined, error.errors);
    throw error;
  }
}
const privatePhoto = (body: ReadableStream | null, mime: string) =>
  new Response(body, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });

/** Parses the contributor form and photo, then stores the proposal or its revision. */
async function saveSubmission(ctx: Ctx, id?: string) {
  const { request } = ctx;
  const owner = ctx.principal.userId;
  const old = id ? await findSubmission(ctx.db(), id) : null;
  checkRevisable(old, owner);
  const key = request.headers.get("Idempotency-Key");
  if (!key || !/^[a-zA-Z0-9-]{16,80}$/.test(key))
    throw new HttpError(400, "The submission needs a valid retry key.");
  const form = await limitedForm(request, MAX_UPLOAD_BYTES + 40000);
  const raw = form.get("data");
  if (typeof raw !== "string" || raw.length > 20000) throw new HttpError(400, "Add the photo details.");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "The form details could not be read.");
  }
  const valid = submissionSchema.safeParse(parsed);
  if (!valid.success)
    return respond({ error: "Check the highlighted fields.", fields: valid.error.flatten().fieldErrors }, 422);
  if (old && Number(form.get("version")) !== Number(old.version))
    throw new HttpError(409, "This proposal changed. Refresh before saving again.");
  const file = form.get("photo");
  let image: NewImage | null = null;
  if (file instanceof File && file.size) {
    if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "Keep each photograph under 12 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let info;
    try {
      info = imageInfo(bytes);
    } catch (error) {
      throw new HttpError(422, error instanceof Error ? error.message : "Invalid photograph.");
    }
    const { width, height } = info;
    if (Math.min(width, height) < 600 || Math.max(width, height) > 16000 || width * height > 80000000)
      throw new HttpError(
        422,
        "Choose a photo at least 600 pixels on each side and no larger than 80 megapixels.",
      );
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer))]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    image = { bytes, mime: info.mime, width, height, digest };
  } else if (!old) throw new HttpError(422, "Choose a JPEG or PNG photograph.");
  const result = await writeSubmission(ctx.db(), ctx.photos, {
    owner,
    key,
    old,
    payload: JSON.stringify(valid.data),
    image,
  });
  return respond(
    { submission: result.submission, ...(result.repeated ? { repeated: true } : {}) },
    result.status,
  );
}

async function submissionPhoto(ctx: Ctx, id: string) {
  const row = await findSubmission(ctx.db(), id);
  if (row.owner_id !== ctx.principal.userId && !ctx.principal.staff)
    throw new HttpError(404, "Photograph not found.");
  const object = await ctx.photos().get(String(row.image_key));
  if (!object) throw new HttpError(404, "Photograph unavailable.");
  return privatePhoto(object.body, String(row.image_mime));
}

async function review(ctx: Ctx, id: string) {
  const body = await bodyJson(ctx.request);
  return respond({ submission: await reviewSubmission(ctx.db(), ctx.principal.userId, id, body) });
}

async function createContent(ctx: Ctx) {
  const body = await bodyJson(ctx.request);
  const record = await editorialCall(() =>
    ctx.content().createDraft(
      body.kind,
      body.sourceId ? { submissionId: String(body.sourceId) } : body.sample === true ? { sample: true } : { submissionId: "" },
      { principal: ctx.principal.userId },
    ),
  );
  return respond({ record }, 201);
}

async function saveContent(ctx: Ctx, id: string) {
  const body = await bodyJson(ctx.request);
  const record = await editorialCall(() =>
    ctx.content().save(
      id,
      { baseVersion: body.version, status: body.status, data: body.data, dateKey: body.dateKey },
      { principal: ctx.principal.userId },
    ),
  );
  return respond({ record });
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

/** The desk's JSON shape: saved packages, the latest releases with their status, and the live pointer. */
async function militaryState(ctx: Ctx, live?: LiveState) {
  const listed = await ctx.editorial().list("military");
  const { releases, ...pointer } = live ?? listed.live;
  return { packages: packagesOf(listed.items), releases, pointer };
}

/**
 * Saves the package for one question in the client's Military sheet. Version 0 creates it.
 * The answer and wrong answers always come from the sheet. Approval never publishes.
 */
async function saveMilitary(ctx: Ctx, aircraftId: string) {
  const body = await bodyJson(ctx.request);
  const item = await editorialCall(() =>
    ctx.editorial().saveDraft(
      "military",
      aircraftId,
      { baseVersion: body.version, stage: body.stage, evidence: body.data },
      { principal: ctx.principal.userId },
    ),
  );
  return respond({ package: packageOf(item) });
}

/**
 * Records a batch release of every approved package: an uploaded candidate, then made live.
 * If another editor wins in between, the candidate stays listed as uploaded. Nothing is
 * delivered or published.
 */
async function releaseMilitary(ctx: Ctx) {
  const body = await bodyJson(ctx.request);
  const live = await editorialCall(() =>
    release(
      ctx.editorial(),
      "military",
      { basis: body.basis, previewed: body.previewed, liveVersion: body.pointerVersion },
      { principal: ctx.principal.userId },
    ),
  );
  return respond(await militaryState(ctx, live));
}

/** Makes an uploaded candidate live, if its packages and photographs are unchanged since upload. */
async function activateMilitary(ctx: Ctx) {
  const body = await bodyJson(ctx.request);
  const live = await editorialCall(() =>
    ctx.editorial().activate(
      "military",
      { release: body.release, liveVersion: body.pointerVersion },
      { principal: ctx.principal.userId },
    ),
  );
  return respond(await militaryState(ctx, live));
}

/** Makes the release before the current one current again. */
async function restoreMilitary(ctx: Ctx) {
  const body = await bodyJson(ctx.request);
  const live = await editorialCall(() =>
    ctx.editorial().restore("military", { liveVersion: body.pointerVersion }, { principal: ctx.principal.userId }),
  );
  return respond(await militaryState(ctx, live));
}

async function auditEvents(ctx: Ctx) {
  const rows = await ctx
    .db()
    .prepare("SELECT entity_id,action,detail,created_at FROM audit_events ORDER BY created_at DESC LIMIT 50")
    .all();
  return respond({ events: rows.results });
}

/** Literal paths come before parameter paths that could match them. */
export const routes: Route[] = [
  route({ method: "GET", path: "featured", audience: "public", run: (ctx) => featured(ctx) }),
  route({ method: "GET", path: "photos/:id", audience: "public", run: (ctx) => featured(ctx, ctx.params.id) }),
  route({ method: "POST", path: "submissions", audience: "member", mutation: true, run: (ctx) => saveSubmission(ctx) }),
  route({
    method: "GET",
    path: "submissions",
    audience: "member",
    run: async (ctx) => respond({ submissions: await ownSubmissions(ctx.db(), ctx.principal.userId) }),
  }),
  route({ method: "PUT", path: "submissions/:id", audience: "owner", mutation: true, run: (ctx) => saveSubmission(ctx, ctx.params.id) }),
  route({ method: "GET", path: "submissions/:id/photo", audience: "owner", run: (ctx) => submissionPhoto(ctx, ctx.params.id) }),
  route({
    method: "POST",
    path: "admin/demo",
    audience: "staff",
    mutation: true,
    run: async (ctx) => {
      await loadDemoData(ctx.db(), ctx.principal.userId);
      return respond({ seeded: true });
    },
  }),
  route({ method: "GET", path: "admin/references", audience: "staff", run: async (ctx) => respond(await ctx.references()) }),
  route({
    method: "GET",
    path: "admin/submissions",
    audience: "staff",
    run: async (ctx) => respond({ submissions: await allSubmissions(ctx.db()) }),
  }),
  route({ method: "PATCH", path: "admin/submissions/:id", audience: "staff", mutation: true, run: (ctx) => review(ctx, ctx.params.id) }),
  route({
    method: "GET",
    path: "admin/content",
    audience: "staff",
    run: async (ctx) => respond({ records: await ctx.content().list() }),
  }),
  route({ method: "POST", path: "admin/content", audience: "staff", mutation: true, run: createContent }),
  route({ method: "PUT", path: "admin/content/:id", audience: "staff", mutation: true, run: (ctx) => saveContent(ctx, ctx.params.id) }),
  route({ method: "GET", path: "admin/military", audience: "staff", run: async (ctx) => respond(await militaryState(ctx)) }),
  route({ method: "POST", path: "admin/military/releases", audience: "staff", mutation: true, run: releaseMilitary }),
  route({ method: "POST", path: "admin/military/releases/activate", audience: "staff", mutation: true, run: activateMilitary }),
  route({ method: "POST", path: "admin/military/releases/restore", audience: "staff", mutation: true, run: restoreMilitary }),
  route({ method: "PUT", path: "admin/military/:id", audience: "staff", mutation: true, run: (ctx) => saveMilitary(ctx, ctx.params.id) }),
  route({ method: "GET", path: "admin/audit", audience: "staff", run: auditEvents }),
];
