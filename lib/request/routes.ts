/**
 * The API route table: every route with its audience, and the handlers. The router
 * (router.ts) has already resolved the principal, applied the account fence and the audience,
 * and checked the origin of mutations before a handler runs. Submissions and the Aircraft
 * Identifier / Plane of the Day content still use D1 directly (until W4); the Military desk goes
 * through EditorialStore. Relative imports only, so the table loads under `node --test`.
 */
import { HttpError, limitedForm, respond } from "../errors.ts";
import { sampleEditorialData } from "../demo-samples.ts";
import {
  submissionSchema,
  imageInfo,
  MAX_UPLOAD_BYTES,
  reviewError,
  editorialErrors,
  localDay,
  validDate,
} from "../rules.ts";
import { auditFor as auditStatement } from "../editorial/d1-store.ts";
import {
  EditorialError,
  packageOf,
  packagesOf,
  release,
  type LiveState,
} from "../editorial/store.ts";
import type {
  EditorialData,
  EditorialRecord,
  Submission,
  SubmissionData,
  SubmissionStatus,
  ReviewChecks,
} from "../types.ts";
import { route, type Route, type RouteContext } from "./router.ts";

type Ctx = RouteContext<"member">;
type PublicCtx = RouteContext<"public">;

type Row = Record<string, string | number | null>;
const idPattern = /^[a-zA-Z0-9-]{1,80}$/;
function demoPhoto(row: Row) {
  return row.digest === "demo:aircraft"
    ? "/media/aircraft.jpg"
    : row.digest === "demo:atc"
      ? "/media/potd-6.jpg"
      : null;
}
function submission(row: Row): Submission {
  return {
    id: String(row.id),
    data: JSON.parse(String(row.payload)),
    status: row.status as SubmissionStatus,
    reviewNote: String(row.review_note),
    checks: JSON.parse(String(row.checks)),
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    width: Number(row.width),
    height: Number(row.height),
    imageBytes: Number(row.image_bytes),
    photoUrl: demoPhoto(row) ?? `/api/submissions/${row.id}/photo`,
  };
}
function editorial(row: Row): EditorialRecord {
  return {
    id: String(row.id),
    kind: row.kind as EditorialRecord["kind"],
    sourceId: row.source_id as string | null,
    data: JSON.parse(String(row.payload)),
    status: row.status as EditorialRecord["status"],
    dateKey: row.date_key as string | null,
    version: Number(row.version),
    updatedAt: String(row.updated_at),
  };
}
async function findSubmission(ctx: Ctx, id: string) {
  if (!idPattern.test(id)) throw new HttpError(404, "Submission not found.");
  const row = await ctx.db()
    .prepare("SELECT * FROM submissions WHERE id = ?")
    .bind(id)
    .first<Row>();
  if (!row) throw new HttpError(404, "Submission not found.");
  return row;
}
function auditFor(
  ctx: Ctx,
  table: "submissions" | "editorial_records",
  actor: string,
  id: string,
  mutation: string,
  action: string,
  detail: unknown,
) {
  return auditStatement(ctx.db(), table, actor, id, mutation, action, detail);
}
async function bodyJson(request: Request) {
  const raw = await request.text();
  if (raw.length > 24000) throw new HttpError(413, "The form is too large.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "The request is not valid JSON.");
  }
}

async function writeSubmission(ctx: Ctx, id?: string) {
  const { request } = ctx;
  const user = ctx.principal;
  const old = id ? await findSubmission(ctx, id) : null;
  if (
    old &&
    (old.owner_id !== user.userId ||
      !["pending", "changes_requested"].includes(String(old.status)))
  )
    throw new HttpError(
      403,
      "Only your pending or returned proposals can be revised.",
    );
  const key = request.headers.get("Idempotency-Key");
  if (!key || !/^[a-zA-Z0-9-]{16,80}$/.test(key))
    throw new HttpError(400, "The submission needs a valid retry key.");
  const form = await limitedForm(request, MAX_UPLOAD_BYTES + 40000);
  const raw = form.get("data");
  if (typeof raw !== "string" || raw.length > 20000)
    throw new HttpError(400, "Add the photo details.");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "The form details could not be read.");
  }
  const valid = submissionSchema.safeParse(parsed);
  if (!valid.success)
    return respond(
      {
        error: "Check the highlighted fields.",
        fields: valid.error.flatten().fieldErrors,
      },
      422,
    );
  if (old && Number(form.get("version")) !== Number(old.version))
    throw new HttpError(
      409,
      "This proposal changed. Refresh before saving again.",
    );
  let imageKey = String(old?.image_key ?? ""),
    mime = String(old?.image_mime ?? ""),
    size = Number(old?.image_bytes ?? 0),
    width = Number(old?.width ?? 0),
    height = Number(old?.height ?? 0),
    digest = String(old?.digest ?? "");
  const file = form.get("photo");
  let bytes: Uint8Array | null = null;
  if (file instanceof File && file.size) {
    if (file.size > MAX_UPLOAD_BYTES)
      throw new HttpError(413, "Keep each photograph under 12 MB.");
    bytes = new Uint8Array(await file.arrayBuffer());
    let info;
    try {
      info = imageInfo(bytes);
    } catch (error) {
      throw new HttpError(
        422,
        error instanceof Error ? error.message : "Invalid photograph.",
      );
    }
    ({ width, height } = info);
    mime = info.mime;
    size = bytes.length;
    if (
      Math.min(width, height) < 600 ||
      Math.max(width, height) > 16000 ||
      width * height > 80000000
    )
      throw new HttpError(
        422,
        "Choose a photo at least 600 pixels on each side and no larger than 80 megapixels.",
      );
    digest = [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer),
      ),
    ]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
  } else if (!old) throw new HttpError(422, "Choose a JPEG or PNG photograph.");
  const payload = JSON.stringify(valid.data);
  if (!old) {
    const repeated = await ctx.db()
      .prepare("SELECT * FROM submissions WHERE request_key = ?")
      .bind(user.userId + ":" + key)
      .first<Row>();
    if (repeated) {
      if (repeated.digest !== digest || repeated.payload !== payload)
        throw new HttpError(
          409,
          "This retry key belongs to a different proposal. Start a new submission.",
        );
      return respond({ submission: submission(repeated), repeated: true });
    }
    const count = await ctx.db()
      .prepare(
        "SELECT COUNT(*) AS count FROM submissions WHERE owner_id = ? AND created_at > ?",
      )
      .bind(user.userId, new Date(Date.now() - 86400000).toISOString())
      .first<{ count: number }>();
    if ((count?.count ?? 0) >= 30)
      throw new HttpError(
        429,
        "You've reached 30 proposals today. Please return tomorrow.",
      );
  }
  const recordId = id ?? crypto.randomUUID(),
    mutation = crypto.randomUUID(),
    now = new Date().toISOString();
  const previousKey = imageKey;
  if (bytes) {
    imageKey = `submissions/${recordId}/${crypto.randomUUID()}`;
    await ctx.photos().put(imageKey, bytes, {
      httpMetadata: { contentType: mime },
    });
  }
  try {
    const statement = old
      ? ctx.db()
          .prepare(
            "UPDATE submissions SET payload=?, image_key=?, image_mime=?, image_bytes=?, width=?, height=?, digest=?, status='pending', checks='{}', review_note='', version=version+1, last_mutation=?, updated_at=? WHERE id=? AND owner_id=? AND version=? AND status IN ('pending','changes_requested')",
          )
          .bind(
            payload,
            imageKey,
            mime,
            size,
            width,
            height,
            digest,
            mutation,
            now,
            recordId,
            user.userId,
            old.version,
          )
      : ctx.db()
          .prepare(
            "INSERT INTO submissions (id,owner_id,request_key,payload,image_key,image_mime,image_bytes,width,height,digest,status,review_note,checks,version,last_mutation,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'pending','','{}',1,?,?,?)",
          )
          .bind(
            recordId,
            user.userId,
            user.userId + ":" + key,
            payload,
            imageKey,
            mime,
            size,
            width,
            height,
            digest,
            mutation,
            now,
            now,
          );
    const results = await ctx.db().batch([
      statement,
      auditFor(
        ctx,
        "submissions",
        user.userId,
        recordId,
        mutation,
        old ? "resubmitted" : "submitted",
        { version: Number(old?.version ?? 0) + 1 },
      ),
    ]);
    if (!results[0].meta.changes)
      throw new HttpError(409, "This proposal changed. Refresh and try again.");
  } catch (error) {
    // Resolve an ambiguous database acknowledgement before deleting uploaded bytes.
    // If the database is unavailable, retain the object for later reconciliation.
    const winner = old
      ? await ctx.db()
          .prepare("SELECT * FROM submissions WHERE id=? AND owner_id=?")
          .bind(recordId, user.userId)
          .first<Row>()
      : await ctx.db()
          .prepare("SELECT * FROM submissions WHERE request_key=?")
          .bind(user.userId + ":" + key)
          .first<Row>();
    if (bytes && (!winner || winner.image_key !== imageKey))
      await ctx.photos().delete(imageKey);
    if (
      winner &&
      ((!old && winner.payload === payload && winner.digest === digest) ||
        (old && winner.last_mutation === mutation))
    )
      return respond({ submission: submission(winner), repeated: true });
    if (winner && !old)
      throw new HttpError(
        409,
        "This retry key belongs to a different proposal. Start a new submission.",
      );
    throw error;
  }
  if (bytes && previousKey)
    await ctx.photos()
      .delete(previousKey)
      .catch(() => undefined);
  return respond(
    { submission: submission(await findSubmission(ctx, recordId)) },
    old ? 200 : 201,
  );
}

async function review(ctx: Ctx, id: string) {
  const { request } = ctx;
  const user = ctx.principal;
  const row = await findSubmission(ctx, id);
  const body = await bodyJson(request);
  const next = body.status as SubmissionStatus,
    note = typeof body.note === "string" ? body.note.trim().slice(0, 2400) : "";
  const checks = (body.checks ?? {}) as Partial<ReviewChecks>;
  if (body.version !== Number(row.version))
    throw new HttpError(
      409,
      "Another editor changed this proposal. Refresh to see their changes.",
    );
  const error = reviewError(
    JSON.parse(String(row.payload)),
    row.status as SubmissionStatus,
    next,
    checks,
    note,
  );
  if (error) throw new HttpError(422, error);
  const mutation = crypto.randomUUID(),
    now = new Date().toISOString();
  const results = await ctx.db().batch([
    ctx.db()
      .prepare(
        "UPDATE submissions SET status=?, review_note=?, checks=?, version=version+1, last_mutation=?, updated_at=? WHERE id=? AND version=?",
      )
      .bind(
        next,
        note,
        JSON.stringify(checks),
        mutation,
        now,
        id,
        body.version,
      ),
    auditFor(ctx, "submissions", user.userId, id, mutation, next, {
      from: row.status,
      note,
      checks,
    }),
  ]);
  if (!results[0].meta.changes)
    throw new HttpError(
      409,
      "This proposal changed. Refresh before reviewing it.",
    );
  return respond({ submission: submission(await findSubmission(ctx, id)) });
}

async function createContent(ctx: Ctx) {
  const { request } = ctx;
  const user = ctx.principal;
  const body = await bodyJson(request);
  if (!["identifier", "potd"].includes(body.kind))
    throw new HttpError(422, "Choose Aircraft Identifier or Plane of the Day.");
  const source = body.sourceId
    ? await findSubmission(ctx, String(body.sourceId))
    : null;
  if (!source && body.sample !== true)
    throw new HttpError(422, "Choose an approved photograph.");
  if (source && source.status !== "approved")
    throw new HttpError(422, "The photograph must be approved first.");
  const submitted: SubmissionData | null = source
    ? JSON.parse(String(source.payload))
    : null;
  const channel = body.kind === "identifier" ? "games" : "plane-of-the-day";
  if (submitted && !submitted.channels.includes(channel))
    throw new HttpError(422, "This photograph was not offered for that use.");
  const id = source ? crypto.randomUUID() : `sample-${body.kind}`,
    mutation = crypto.randomUUID(),
    now = new Date().toISOString();
  const data: EditorialData = submitted
    ? {
        title: submitted.title,
        aircraft: submitted.aircraft,
        photographer: submitted.photographer,
        credit: submitted.credit,
        description: submitted.description,
        correctAnswer: submitted.aircraft,
        distractors: ["", "", ""],
        difficulty: "Trainee",
        factualSource: submitted.factualSource,
        imageUrl: `/api/submissions/${source!.id}/photo`,
      }
    : {
        title:
          body.kind === "identifier"
            ? "Identify this aircraft"
            : "Threshold Geometry",
        aircraft: body.kind === "identifier" ? "Boeing 767-200" : "Boeing 757",
        photographer: "Josh M",
        credit: "Josh M (@iamjoshmark)",
        description:
          "Client-supplied preview photograph. Website permission and factual review are still required before publication.",
        correctAnswer: "Boeing 767-200",
        distractors: ["Boeing 777", "Airbus A330", "Airbus A350"],
        difficulty: "Trainee",
        factualSource: "",
        imageUrl:
          body.kind === "identifier"
            ? "/media/aircraft.jpg"
            : "/media/potd-6.jpg",
      };
  const statement = source
    ? ctx.db()
        .prepare(
          "INSERT INTO editorial_records (id,kind,source_id,payload,status,date_key,version,last_mutation,updated_at) SELECT ?,?,?,?,'draft',NULL,1,?,? FROM submissions WHERE id=? AND status='approved' AND version=?",
        )
        .bind(
          id,
          body.kind,
          source.id,
          JSON.stringify(data),
          mutation,
          now,
          source.id,
          source.version,
        )
    : ctx.db()
        .prepare(
          "INSERT OR IGNORE INTO editorial_records (id,kind,source_id,payload,status,date_key,version,last_mutation,updated_at) VALUES (?,?,NULL,?,'draft',NULL,1,?,?)",
        )
        .bind(id, body.kind, JSON.stringify(data), mutation, now);
  await ctx.db().batch([
    statement,
    auditFor(ctx, "editorial_records", user.userId, id, mutation, "draft_created", {
      sourceId: source?.id ?? null,
    }),
  ]);
  return respond(
    {
      record: editorial(
        (await ctx.db()
          .prepare("SELECT * FROM editorial_records WHERE id=?")
          .bind(id)
          .first<Row>())!,
      ),
    },
    201,
  );
}

async function saveContent(ctx: Ctx, id: string) {
  const { request } = ctx;
  const user = ctx.principal;
  const row = await ctx.db()
    .prepare("SELECT * FROM editorial_records WHERE id=?")
    .bind(id)
    .first<Row>();
  if (!row) throw new HttpError(404, "Content not found.");
  const body = await bodyJson(request);
  if (body.version !== Number(row.version))
    throw new HttpError(409, "This content changed. Refresh before saving.");
  if (!["draft", "scheduled", "published", "archived"].includes(body.status))
    throw new HttpError(422, "Unknown content state.");
  const data = body.data as EditorialData;
  if (
    !data ||
    ![
      "title",
      "aircraft",
      "photographer",
      "credit",
      "description",
      "correctAnswer",
      "difficulty",
      "factualSource",
      "imageUrl",
    ].every((key) => typeof data[key as keyof EditorialData] === "string") ||
    !Array.isArray(data.distractors) ||
    data.distractors.length !== 3 ||
    data.distractors.some((s) => typeof s !== "string")
  )
    throw new HttpError(422, "Check the content fields.");
  if (Object.values(data).some((v) => typeof v === "string" && v.length > 2400))
    throw new HttpError(422, "Keep each text field under 2,400 characters.");
  let source: Row | null = null;
  if (body.status === "scheduled" || body.status === "published") {
    const errors = editorialErrors(row.kind as "identifier" | "potd", data);
    if (errors.length) return respond({ error: errors.join(" ") }, 422);
    if (!row.source_id)
      throw new HttpError(
        422,
        "Sample content cannot be published. Use an approved community submission with verified rights.",
      );
    source = await findSubmission(ctx, String(row.source_id));
    const sd: SubmissionData = JSON.parse(String(source.payload));
    if (String(source.digest).startsWith("demo:"))
      throw new HttpError(
        422,
        "Demo proposals cannot be published. Use a real submission with separately verified permission.",
      );
    if (
      source.status !== "approved" ||
      !sd.channels.includes(row.kind === "potd" ? "plane-of-the-day" : "games")
    )
      throw new HttpError(
        422,
        "The source photograph is no longer approved for this use.",
      );
    if (row.kind === "potd" && !sd.channels.includes("website"))
      throw new HttpError(
        422,
        "Website permission is required to publish this photograph on the prototype.",
      );
    if (row.kind === "potd" && !validDate(body.dateKey ?? ""))
      throw new HttpError(422, "Choose a valid feature date.");
    if (row.kind === "identifier" && body.status === "scheduled")
      throw new HttpError(
        422,
        "Aircraft Identifier supports draft or prototype-ready content, not daily scheduling.",
      );
  }
  // Media and attribution stay linked to the verified submission, never arbitrary image URLs.
  data.imageUrl = JSON.parse(String(row.payload)).imageUrl;
  const mutation = crypto.randomUUID(),
    now = new Date().toISOString();
  const update = ctx.db()
    .prepare(
      "UPDATE editorial_records SET payload=?,status=?,date_key=?,version=version+1,last_mutation=?,updated_at=? WHERE id=? AND version=? AND (? IS NULL OR EXISTS (SELECT 1 FROM submissions WHERE id=? AND status='approved' AND version=?))",
    )
    .bind(
      JSON.stringify(data),
      body.status,
      row.kind === "potd" ? (body.dateKey ?? null) : null,
      mutation,
      now,
      id,
      body.version,
      source?.id ?? null,
      source?.id ?? null,
      source?.version ?? 0,
    );
  const result = await ctx.db().batch([
    update,
    auditFor(
        ctx,
        "editorial_records",
      user.userId,
      id,
      mutation,
      "content_" + body.status,
      { version: body.version + 1, date: body.dateKey ?? null },
    ),
  ]);
  if (!result[0].meta.changes)
    throw new HttpError(
      409,
      "This content or its photograph changed. Refresh before saving.",
    );
  return respond({
    record: editorial(
      (await ctx.db()
        .prepare("SELECT * FROM editorial_records WHERE id=?")
        .bind(id)
        .first<Row>())!,
    ),
  });
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
  const { request } = ctx;
  const user = ctx.principal;
  const body = await bodyJson(request);
  const item = await editorialCall(() =>
    ctx.editorial().saveDraft(
      "military",
      aircraftId,
      { baseVersion: body.version, stage: body.stage, evidence: body.data },
      { principal: user.userId },
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
  const { request } = ctx;
  const user = ctx.principal;
  const body = await bodyJson(request);
  const live = await editorialCall(() =>
    release(
      ctx.editorial(),
      "military",
      { basis: body.basis, previewed: body.previewed, liveVersion: body.pointerVersion },
      { principal: user.userId },
    ),
  );
  return respond(await militaryState(ctx, live));
}

/** Makes an uploaded candidate live, if its packages and photographs are unchanged since upload. */
async function activateMilitary(ctx: Ctx) {
  const { request } = ctx;
  const user = ctx.principal;
  const body = await bodyJson(request);
  const live = await editorialCall(() =>
    ctx.editorial().activate(
      "military",
      { release: body.release, liveVersion: body.pointerVersion },
      { principal: user.userId },
    ),
  );
  return respond(await militaryState(ctx, live));
}

/** Makes the release before the current one current again. */
async function restoreMilitary(ctx: Ctx) {
  const { request } = ctx;
  const user = ctx.principal;
  const body = await bodyJson(request);
  const live = await editorialCall(() =>
    ctx.editorial().restore("military", { liveVersion: body.pointerVersion }, { principal: user.userId }),
  );
  return respond(await militaryState(ctx, live));
}

async function featured(ctx: PublicCtx, photoId?: string) {
  const { request } = ctx;
  const zone = new URL(request.url).searchParams.get("timeZone") ?? "UTC";
  let day;
  try {
    day = localDay(zone);
  } catch {
    throw new HttpError(422, "Choose a valid timezone.");
  }
  const rows = await ctx.db()
    .prepare(
      "SELECT e.*,s.image_key,s.image_mime FROM editorial_records e JOIN submissions s ON e.source_id=s.id WHERE e.kind='potd' AND e.status IN ('published','scheduled') AND e.date_key<=? AND s.status='approved' ORDER BY e.date_key DESC,e.updated_at DESC LIMIT 100",
    )
    .bind(day)
    .all<Row>();
  const eligible = rows.results.filter((row) => {
    const data = JSON.parse(String(row.payload));
    return !!data.credit;
  });
  if (photoId) {
    const row = eligible.find((r) => r.id === photoId);
    if (!row) throw new HttpError(404, "Photograph not published.");
    const object = await ctx.photos().get(String(row.image_key));
    if (!object) throw new HttpError(404, "Photograph unavailable.");
    return new Response(object.body, {
      headers: {
        "Content-Type": String(row.image_mime),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  }
  const photos = eligible.map((row) => {
    const data: EditorialData = JSON.parse(String(row.payload));
    return {
      id: row.id,
      title: data.title,
      aircraft: data.aircraft,
      photographer: data.photographer,
      credit: data.credit,
      description: data.description,
      date: row.date_key,
      imageUrl: `/api/photos/${row.id}?timeZone=${encodeURIComponent(zone)}`,
    };
  });
  return respond({ featured: photos[0] ?? null, archive: photos });
}

async function loadDemo(ctx: Ctx) {
  const user = ctx.principal,
    now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  for (const kind of ["aircraft", "atc"] as const) {
    const id = `demo-submission-${kind}`,
      mutation = crypto.randomUUID();
    const data: SubmissionData = {
      title:
        kind === "aircraft"
          ? "KLM on approach [Demo]"
          : "Airport operations reference [Demo]",
      photographer: "Josh M",
      email: "preview@sites.test",
      portfolio: "https://www.instagram.com/iamjoshmark/",
      category: kind,
      customCategory: "",
      targetGames: [kind === "aircraft" ? "aircraft-identifier" : "atc-match"],
      aircraft: kind === "aircraft" ? "Boeing 767-200" : "Boeing 757",
      airline: kind === "aircraft" ? "KLM" : "",
      registration: "",
      location: "Location awaiting review",
      airportCode: "",
      capturedOn: "",
      description:
        "Sample proposal for demonstrating the editorial workflow. Aircraft identity and location still require review. This sample does not grant publishing permission.",
      factualSource: "",
      credit: "Josh M (@iamjoshmark)",
      rightsBasis: "owner",
      rightsEvidence: "",
      channels: ["games", "website", "plane-of-the-day"],
      imageOrigin: "camera",
      consent: true,
    };
    statements.push(
      ctx.db()
        .prepare(
          "INSERT OR IGNORE INTO submissions (id,owner_id,request_key,payload,image_key,image_mime,image_bytes,width,height,digest,status,review_note,checks,version,last_mutation,created_at,updated_at) VALUES (?,?,?,?,?,'image/jpeg',0,1280,960,?,'pending','Demo data: factual review and publication rights are unverified.','{}',1,?,?,?)",
        )
        .bind(
          id,
          user.userId,
          id,
          JSON.stringify(data),
          `demo-${kind}`,
          `demo:${kind}`,
          mutation,
          now,
          now,
        ),
    );
    statements.push(
      auditFor(ctx, "submissions", user.userId, id, mutation, "demo_loaded", {
        sample: true,
      }),
    );
  }
  for (const kind of ["identifier", "potd"] as const) {
    const id = `sample-${kind}`,
      mutation = crypto.randomUUID();
    const data = sampleEditorialData(kind);
    statements.push(
      ctx.db()
        .prepare(
          "INSERT OR IGNORE INTO editorial_records (id,kind,source_id,payload,status,date_key,version,last_mutation,updated_at) VALUES (?,?,NULL,?,'draft',NULL,1,?,?)",
        )
        .bind(id, kind, JSON.stringify(data), mutation, now),
    );
    statements.push(
      auditFor(
        ctx,
        "editorial_records",
        user.userId,
        id,
        mutation,
        "demo_draft_loaded",
        { sample: true },
      ),
    );
  }
  await ctx.db().batch(statements);
  return respond({ seeded: true });
}

async function ownSubmissions(ctx: Ctx) {
  const rows = await ctx
    .db()
    .prepare("SELECT * FROM submissions WHERE owner_id=? ORDER BY created_at DESC LIMIT 100")
    .bind(ctx.principal.userId)
    .all<Row>();
  return respond({ submissions: rows.results.map(submission) });
}

async function submissionPhoto(ctx: Ctx, id: string) {
  const row = await findSubmission(ctx, id);
  if (row.owner_id !== ctx.principal.userId && !ctx.principal.staff)
    throw new HttpError(404, "Photograph not found.");
  const object = await ctx.photos().get(String(row.image_key));
  if (!object) throw new HttpError(404, "Photograph unavailable.");
  return new Response(object.body, {
    headers: {
      "Content-Type": String(row.image_mime),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}

async function allSubmissions(ctx: Ctx) {
  const rows = await ctx
    .db()
    .prepare("SELECT * FROM submissions ORDER BY created_at DESC LIMIT 200")
    .all<Row>();
  return respond({ submissions: rows.results.map(submission) });
}

async function contentRecords(ctx: Ctx) {
  const rows = await ctx
    .db()
    .prepare(
      "SELECT * FROM editorial_records WHERE kind IN ('identifier','potd') ORDER BY updated_at DESC LIMIT 200",
    )
    .all<Row>();
  return respond({ records: rows.results.map(editorial) });
}

async function auditEvents(ctx: Ctx) {
  const rows = await ctx
    .db()
    .prepare(
      "SELECT entity_id,action,detail,created_at FROM audit_events ORDER BY created_at DESC LIMIT 50",
    )
    .all();
  return respond({ events: rows.results });
}

/** Literal paths come before parameter paths that could match them. */
export const routes: Route[] = [
  route({ method: "GET", path: "featured", audience: "public", run: (ctx) => featured(ctx) }),
  route({ method: "GET", path: "photos/:id", audience: "public", run: (ctx) => featured(ctx, ctx.params.id) }),
  route({ method: "POST", path: "submissions", audience: "member", mutation: true, run: (ctx) => writeSubmission(ctx) }),
  route({ method: "GET", path: "submissions", audience: "member", run: ownSubmissions }),
  route({ method: "PUT", path: "submissions/:id", audience: "owner", mutation: true, run: (ctx) => writeSubmission(ctx, ctx.params.id) }),
  route({ method: "GET", path: "submissions/:id/photo", audience: "owner", run: (ctx) => submissionPhoto(ctx, ctx.params.id) }),
  route({ method: "POST", path: "admin/demo", audience: "staff", mutation: true, run: loadDemo }),
  route({ method: "GET", path: "admin/references", audience: "staff", run: async (ctx) => respond(await ctx.references()) }),
  route({ method: "GET", path: "admin/submissions", audience: "staff", run: allSubmissions }),
  route({ method: "PATCH", path: "admin/submissions/:id", audience: "staff", mutation: true, run: (ctx) => review(ctx, ctx.params.id) }),
  route({ method: "GET", path: "admin/content", audience: "staff", run: contentRecords }),
  route({ method: "POST", path: "admin/content", audience: "staff", mutation: true, run: createContent }),
  route({ method: "PUT", path: "admin/content/:id", audience: "staff", mutation: true, run: (ctx) => saveContent(ctx, ctx.params.id) }),
  route({ method: "GET", path: "admin/military", audience: "staff", run: async (ctx) => respond(await militaryState(ctx)) }),
  route({ method: "POST", path: "admin/military/releases", audience: "staff", mutation: true, run: releaseMilitary }),
  route({ method: "POST", path: "admin/military/releases/activate", audience: "staff", mutation: true, run: activateMilitary }),
  route({ method: "POST", path: "admin/military/releases/restore", audience: "staff", mutation: true, run: restoreMilitary }),
  route({ method: "PUT", path: "admin/military/:id", audience: "staff", mutation: true, run: (ctx) => saveMilitary(ctx, ctx.params.id) }),
  route({ method: "GET", path: "admin/audit", audience: "staff", run: auditEvents }),
];
