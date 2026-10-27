import {
  database,
  bucket,
  identity,
  isStaff,
  staff,
  sameOrigin,
  respond,
  failure,
  HttpError,
  limitedForm,
} from "@/lib/server";
import { accountSessionKey } from "@/lib/account-server";
import { sampleEditorialData } from "@/lib/demo-samples";
import {
  submissionSchema,
  imageInfo,
  MAX_UPLOAD_BYTES,
  reviewError,
  editorialErrors,
  localDay,
  validDate,
} from "@/lib/rules";
import {
  militaryRoster,
  militaryStages,
  releaseBasis,
  releaseErrors,
  parsePackageData,
  transitionError,
  type MilitaryPackage,
  type MilitaryRelease,
  type MilitaryStage,
  type ReleaseAsset,
  type ReleasePointer,
} from "@/lib/military";
import type {
  EditorialData,
  EditorialRecord,
  Submission,
  SubmissionData,
  SubmissionStatus,
  ReviewChecks,
} from "@/lib/types";

export const dynamic = "force-dynamic";
type Row = Record<string, string | number | null>;
type Context = { params: Promise<{ path: string[] }> };
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
async function findSubmission(id: string) {
  if (!idPattern.test(id)) throw new HttpError(404, "Submission not found.");
  const row = await database()
    .prepare("SELECT * FROM submissions WHERE id = ?")
    .bind(id)
    .first<Row>();
  if (!row) throw new HttpError(404, "Submission not found.");
  return row;
}
function auditFor(
  table: "submissions" | "editorial_records",
  actor: string,
  id: string,
  mutation: string,
  action: string,
  detail: unknown,
) {
  return database()
    .prepare(
      `INSERT INTO audit_events (id, actor_id, entity_id, action, detail, created_at) SELECT ?, ?, ?, ?, ?, ? FROM ${table} WHERE id = ? AND last_mutation = ?`,
    )
    .bind(
      mutation,
      actor,
      id,
      action,
      JSON.stringify(detail),
      new Date().toISOString(),
      id,
      mutation,
    );
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

async function writeSubmission(request: Request, id?: string) {
  sameOrigin(request);
  const user = await identity();
  const old = id ? await findSubmission(id) : null;
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
    const repeated = await database()
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
    const count = await database()
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
    await bucket().put(imageKey, bytes, {
      httpMetadata: { contentType: mime },
    });
  }
  try {
    const statement = old
      ? database()
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
      : database()
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
    const results = await database().batch([
      statement,
      auditFor(
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
      ? await database()
          .prepare("SELECT * FROM submissions WHERE id=? AND owner_id=?")
          .bind(recordId, user.userId)
          .first<Row>()
      : await database()
          .prepare("SELECT * FROM submissions WHERE request_key=?")
          .bind(user.userId + ":" + key)
          .first<Row>();
    if (bytes && (!winner || winner.image_key !== imageKey))
      await bucket().delete(imageKey);
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
    await bucket()
      .delete(previousKey)
      .catch(() => undefined);
  return respond(
    { submission: submission(await findSubmission(recordId)) },
    old ? 200 : 201,
  );
}

async function review(request: Request, id: string) {
  sameOrigin(request);
  const user = await staff();
  const row = await findSubmission(id);
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
  const results = await database().batch([
    database()
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
    auditFor("submissions", user.userId, id, mutation, next, {
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
  return respond({ submission: submission(await findSubmission(id)) });
}

async function createContent(request: Request) {
  sameOrigin(request);
  const user = await staff();
  const body = await bodyJson(request);
  if (!["identifier", "potd"].includes(body.kind))
    throw new HttpError(422, "Choose Aircraft Identifier or Plane of the Day.");
  const source = body.sourceId
    ? await findSubmission(String(body.sourceId))
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
    ? database()
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
    : database()
        .prepare(
          "INSERT OR IGNORE INTO editorial_records (id,kind,source_id,payload,status,date_key,version,last_mutation,updated_at) VALUES (?,?,NULL,?,'draft',NULL,1,?,?)",
        )
        .bind(id, body.kind, JSON.stringify(data), mutation, now);
  await database().batch([
    statement,
    auditFor("editorial_records", user.userId, id, mutation, "draft_created", {
      sourceId: source?.id ?? null,
    }),
  ]);
  return respond(
    {
      record: editorial(
        (await database()
          .prepare("SELECT * FROM editorial_records WHERE id=?")
          .bind(id)
          .first<Row>())!,
      ),
    },
    201,
  );
}

async function saveContent(request: Request, id: string) {
  sameOrigin(request);
  const user = await staff();
  const row = await database()
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
    source = await findSubmission(String(row.source_id));
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
  const update = database()
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
  const result = await database().batch([
    update,
    auditFor(
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
      (await database()
        .prepare("SELECT * FROM editorial_records WHERE id=?")
        .bind(id)
        .first<Row>())!,
    ),
  });
}

function militaryPackage(row: Row): MilitaryPackage {
  return {
    aircraftId: String(row.id).replace(/^military-/, ""),
    stage: row.status as MilitaryStage,
    data: JSON.parse(String(row.payload)),
    version: Number(row.version),
    updatedAt: String(row.updated_at),
  };
}

/** Saves one roster aircraft's package. Version 0 creates it. Approval records a decision; it never publishes. */
async function saveMilitary(request: Request, aircraftId: string) {
  sameOrigin(request);
  const user = await staff();
  const aircraft = militaryRoster.find((a) => a.id === aircraftId);
  if (!aircraft) throw new HttpError(404, "This aircraft is not on the approved roster.");
  const body = await bodyJson(request);
  const data = parsePackageData(body.data);
  if (!data) throw new HttpError(422, "Check the package fields.");
  if (!militaryStages.includes(body.stage))
    throw new HttpError(422, "Unknown preparation stage.");
  const id = `military-${aircraft.id}`;
  const row = await database()
    .prepare("SELECT * FROM editorial_records WHERE id=? AND kind='military'")
    .bind(id)
    .first<Row>();
  if (body.version !== (row ? Number(row.version) : 0))
    throw new HttpError(
      409,
      "Another editor changed this package. Refresh to see their changes.",
    );
  const from = (row?.status ?? "missing_photo") as MilitaryStage,
    to = body.stage as MilitaryStage,
    payload = JSON.stringify(data);
  if (from === "approved" && to === "approved" && row?.payload !== payload)
    throw new HttpError(
      422,
      "Step an approved package back to Previewed before changing it.",
    );
  const error = transitionError(from, to, data);
  if (error) throw new HttpError(422, error);
  // A contributed photograph must stay approved for game use; demo proposals carry no rights.
  let source: Row | null = null;
  if (data.photoSource === "submission" && data.submissionId) {
    source = await findSubmission(data.submissionId);
    const sd: SubmissionData = JSON.parse(String(source.payload));
    if (
      militaryStages.indexOf(to) >= 1 &&
      (source.status !== "approved" ||
        !sd.channels.includes("games") ||
        String(source.digest).startsWith("demo:"))
    )
      throw new HttpError(
        422,
        "The linked submission must be a real contribution approved for game use.",
      );
  }
  const mutation = crypto.randomUUID(),
    now = new Date().toISOString(),
    guard = source && militaryStages.indexOf(to) >= 1 ? source : null;
  const write = row
    ? database()
        .prepare(
          "UPDATE editorial_records SET source_id=?,payload=?,status=?,version=version+1,last_mutation=?,updated_at=? WHERE id=? AND kind='military' AND version=? AND (? IS NULL OR EXISTS (SELECT 1 FROM submissions WHERE id=? AND status='approved' AND version=?))",
        )
        .bind(
          source?.id ?? null,
          payload,
          to,
          mutation,
          now,
          id,
          body.version,
          guard?.id ?? null,
          guard?.id ?? null,
          guard?.version ?? 0,
        )
    : database()
        .prepare(
          "INSERT INTO editorial_records (id,kind,source_id,payload,status,date_key,version,last_mutation,updated_at) SELECT ?,'military',?,?,?,NULL,1,?,? WHERE NOT EXISTS (SELECT 1 FROM editorial_records WHERE id=?) AND (? IS NULL OR EXISTS (SELECT 1 FROM submissions WHERE id=? AND status='approved' AND version=?))",
        )
        .bind(
          id,
          source?.id ?? null,
          payload,
          to,
          mutation,
          now,
          id,
          guard?.id ?? null,
          guard?.id ?? null,
          guard?.version ?? 0,
        );
  const results = await database().batch([
    write,
    auditFor("editorial_records", user.userId, id, mutation, `military_${to}`, {
      aircraft: aircraft.name,
      from,
      version: Number(body.version) + 1,
    }),
  ]);
  if (!results[0].meta.changes)
    throw new HttpError(
      409,
      "This package or its photograph changed. Refresh before saving.",
    );
  return respond({
    package: militaryPackage(
      (await database()
        .prepare("SELECT * FROM editorial_records WHERE id=?")
        .bind(id)
        .first<Row>())!,
    ),
  });
}

const POINTER_ID = "military-release-current";
async function militaryState() {
  const [packages, releases, pointer] = await Promise.all([
    database()
      .prepare("SELECT * FROM editorial_records WHERE kind='military' ORDER BY id")
      .all<Row>(),
    database()
      .prepare(
        "SELECT id,payload FROM editorial_records WHERE kind='military_release' ORDER BY updated_at DESC LIMIT 50",
      )
      .all<Row>(),
    database()
      .prepare("SELECT * FROM editorial_records WHERE id=? AND kind='military_pointer'")
      .bind(POINTER_ID)
      .first<Row>(),
  ]);
  return {
    rows: packages.results,
    packages: packages.results.map(militaryPackage),
    releases: releases.results.map((row): MilitaryRelease => {
      const r = JSON.parse(String(row.payload));
      return { number: r.number, basis: r.basis, aircraft: r.packages.length, createdAt: r.createdAt };
    }),
    pointerRow: pointer,
    pointer: {
      ...(pointer
        ? (JSON.parse(String(pointer.payload)) as ReleasePointer)
        : { current: null, history: [] }),
      version: pointer ? Number(pointer.version) : 0,
    },
  };
}
/** The exact package versions, in the order the write guard's subquery reads them. */
const packageGuard = (rows: Row[]) => rows.map((r) => `${r.id}:${r.version}`).join(",");
const PACKAGES_UNCHANGED =
  "(SELECT group_concat(id || ':' || version, ',') FROM (SELECT id,version FROM editorial_records WHERE kind='military' ORDER BY id)) IS ?";

/** Records a batch release of every approved package. Nothing is delivered or published. */
async function releaseMilitary(request: Request) {
  sameOrigin(request);
  const user = await staff();
  const body = await bodyJson(request);
  const state = await militaryState();
  if (body.pointerVersion !== state.pointer.version)
    throw new HttpError(409, "Another editor changed the release. Refresh to see it.");
  if (body.basis !== releaseBasis(state.packages))
    throw new HttpError(
      409,
      "Packages changed since this preview. Refresh and review the sample Trips again.",
    );
  if (body.previewed !== true)
    throw new HttpError(422, "Review the sample Trips for every rank before releasing.");
  if (state.releases.find((r) => r.number === state.pointer.current)?.basis === body.basis)
    throw new HttpError(422, "These package versions are already the current release.");
  const ids = [
    ...new Set(
      state.packages
        .filter((p) => p.data.photoSource === "submission" && idPattern.test(p.data.submissionId))
        .map((p) => p.data.submissionId),
    ),
  ];
  const assets = new Map<string, ReleaseAsset>();
  if (ids.length) {
    const found = await database()
      .prepare(
        "SELECT id,status,payload,digest,image_bytes FROM submissions WHERE id IN (SELECT value FROM json_each(?))",
      )
      .bind(JSON.stringify(ids))
      .all<Row>();
    for (const row of found.results)
      assets.set(String(row.id), {
        status: String(row.status),
        games: (JSON.parse(String(row.payload)) as SubmissionData).channels.includes("games"),
        demo: String(row.digest).startsWith("demo:"),
        bytes: Number(row.image_bytes),
        digest: String(row.digest),
      });
  }
  const errors = releaseErrors(state.packages, assets);
  if (errors.length)
    return respond({ error: "This batch cannot be released yet.", errors }, 422);
  const number = Math.max(0, ...state.releases.map((r) => r.number)) + 1,
    mutation = crypto.randomUUID(),
    now = new Date().toISOString(),
    pointer: ReleasePointer = {
      current: number,
      history:
        state.pointer.current === null
          ? state.pointer.history
          : [...state.pointer.history, state.pointer.current],
    };
  const snapshot = {
    number,
    basis: body.basis,
    createdAt: now,
    packages: militaryRoster.map((a) => {
      const p = state.packages.find((item) => item.aircraftId === a.id)!;
      return {
        aircraftId: a.id,
        rank: a.rank,
        version: p.version,
        data: p.data,
        digest: assets.get(p.data.submissionId)!.digest,
      };
    }),
  };
  // The pointer moves only if no package or linked photograph changed since the checks above.
  const guards = `${PACKAGES_UNCHANGED} AND (SELECT COUNT(*) FROM submissions WHERE status='approved' AND id IN (SELECT value FROM json_each(?))) = ?`;
  const guardValues = [packageGuard(state.rows), JSON.stringify(ids), ids.length];
  const move = state.pointerRow
    ? database()
        .prepare(
          `UPDATE editorial_records SET payload=?,version=version+1,last_mutation=?,updated_at=? WHERE id=? AND kind='military_pointer' AND version=? AND ${guards}`,
        )
        .bind(JSON.stringify(pointer), mutation, now, POINTER_ID, state.pointer.version, ...guardValues)
    : database()
        .prepare(
          `INSERT INTO editorial_records (id,kind,source_id,payload,status,date_key,version,last_mutation,updated_at) SELECT ?,'military_pointer',NULL,?,'current',NULL,1,?,? WHERE NOT EXISTS (SELECT 1 FROM editorial_records WHERE id=?) AND ${guards}`,
        )
        .bind(POINTER_ID, JSON.stringify(pointer), mutation, now, POINTER_ID, ...guardValues);
  const results = await database().batch([
    move,
    database()
      .prepare(
        "INSERT INTO editorial_records (id,kind,source_id,payload,status,date_key,version,last_mutation,updated_at) SELECT ?,'military_release',NULL,?,'released',NULL,1,?,? WHERE EXISTS (SELECT 1 FROM editorial_records WHERE id=? AND last_mutation=?)",
      )
      .bind(`military-release-${number}`, JSON.stringify(snapshot), mutation, now, POINTER_ID, mutation),
    auditFor("editorial_records", user.userId, POINTER_ID, mutation, "military_released", {
      release: number,
      previous: state.pointer.current,
      aircraft: snapshot.packages.length,
    }),
  ]);
  if (!results[0].meta.changes)
    throw new HttpError(409, "The packages or release changed. Refresh before releasing.");
  const { packages, releases, pointer: latest } = await militaryState();
  return respond({ packages, releases, pointer: latest });
}

/** Makes the release before the current one current again. */
async function restoreMilitary(request: Request) {
  sameOrigin(request);
  const user = await staff();
  const body = await bodyJson(request);
  const state = await militaryState();
  if (body.pointerVersion !== state.pointer.version)
    throw new HttpError(409, "Another editor changed the release. Refresh to see it.");
  const history = [...state.pointer.history],
    previous = history.pop();
  if (!state.pointerRow || previous === undefined)
    throw new HttpError(422, "There is no earlier release to restore.");
  const mutation = crypto.randomUUID(),
    now = new Date().toISOString(),
    pointer: ReleasePointer = { current: previous, history };
  const results = await database().batch([
    database()
      .prepare(
        "UPDATE editorial_records SET payload=?,version=version+1,last_mutation=?,updated_at=? WHERE id=? AND kind='military_pointer' AND version=?",
      )
      .bind(JSON.stringify(pointer), mutation, now, POINTER_ID, state.pointer.version),
    auditFor("editorial_records", user.userId, POINTER_ID, mutation, "military_release_restored", {
      release: previous,
      replaced: state.pointer.current,
    }),
  ]);
  if (!results[0].meta.changes)
    throw new HttpError(409, "Another editor changed the release. Refresh to see it.");
  const { packages, releases, pointer: latest } = await militaryState();
  return respond({ packages, releases, pointer: latest });
}

async function featured(request: Request, photoId?: string) {
  const zone = new URL(request.url).searchParams.get("timeZone") ?? "UTC";
  let day;
  try {
    day = localDay(zone);
  } catch {
    throw new HttpError(422, "Choose a valid timezone.");
  }
  const rows = await database()
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
    const object = await bucket().get(String(row.image_key));
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

async function loadDemo(request: Request) {
  sameOrigin(request);
  const user = await staff(),
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
      database()
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
      auditFor("submissions", user.userId, id, mutation, "demo_loaded", {
        sample: true,
      }),
    );
  }
  for (const kind of ["identifier", "potd"] as const) {
    const id = `sample-${kind}`,
      mutation = crypto.randomUUID();
    const data = sampleEditorialData(kind);
    statements.push(
      database()
        .prepare(
          "INSERT OR IGNORE INTO editorial_records (id,kind,source_id,payload,status,date_key,version,last_mutation,updated_at) VALUES (?,?,NULL,?,'draft',NULL,1,?,?)",
        )
        .bind(id, kind, JSON.stringify(data), mutation, now),
    );
    statements.push(
      auditFor(
        "editorial_records",
        user.userId,
        id,
        mutation,
        "demo_draft_loaded",
        { sample: true },
      ),
    );
  }
  await database().batch(statements);
  return respond({ seeded: true });
}

async function handle(request: Request, context: Context) {
  try {
    const { path } = await context.params,
      route = path.join("/"),
      method = request.method;
    // Optional UI fence: reject an operation started under another account. Authentication and
    // ownership checks still apply independently; this marker grants no access on its own.
    const expectedAccount = request.headers.get("X-Account-Session");
    if (expectedAccount && (path[0] === "admin" || path[0] === "submissions")) {
      const user = await identity();
      if (expectedAccount !== (await accountSessionKey(user.userId)))
        throw new HttpError(
          409,
          "Your signed-in account changed. Reload before continuing.",
          "ACCOUNT_CHANGED",
        );
    }
    if (method === "GET" && route === "featured")
      return await featured(request);
    if (method === "GET" && path[0] === "photos" && path.length === 2)
      return await featured(request, path[1]);
    if (route === "submissions" && method === "POST")
      return await writeSubmission(request);
    if (route === "submissions" && method === "GET") {
      const user = await identity();
      const rows = await database()
        .prepare(
          "SELECT * FROM submissions WHERE owner_id=? ORDER BY created_at DESC LIMIT 100",
        )
        .bind(user.userId)
        .all<Row>();
      return respond({ submissions: rows.results.map(submission) });
    }
    if (path[0] === "submissions" && path.length === 2 && method === "PUT")
      return await writeSubmission(request, path[1]);
    if (path[0] === "submissions" && path[2] === "photo" && method === "GET") {
      const user = await identity(),
        row = await findSubmission(path[1]);
      if (row.owner_id !== user.userId && !(await isStaff()))
        throw new HttpError(404, "Photograph not found.");
      const object = await bucket().get(String(row.image_key));
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
    if (path[0] === "admin") {
      await staff();
      if (route === "admin/demo" && method === "POST")
        return await loadDemo(request);
      if (route === "admin/references" && method === "GET") {
        const { default: data } =
          await import("@/data/reference-airports.json");
        return respond(data);
      }
      if (route === "admin/submissions" && method === "GET") {
        const rows = await database()
          .prepare(
            "SELECT * FROM submissions ORDER BY created_at DESC LIMIT 200",
          )
          .all<Row>();
        return respond({ submissions: rows.results.map(submission) });
      }
      if (path[1] === "submissions" && path.length === 3 && method === "PATCH")
        return await review(request, path[2]);
      if (route === "admin/content" && method === "GET") {
        const rows = await database()
          .prepare(
            "SELECT * FROM editorial_records WHERE kind IN ('identifier','potd') ORDER BY updated_at DESC LIMIT 200",
          )
          .all<Row>();
        return respond({ records: rows.results.map(editorial) });
      }
      if (route === "admin/military" && method === "GET") {
        const { packages, releases, pointer } = await militaryState();
        return respond({ packages, releases, pointer });
      }
      if (route === "admin/military/releases" && method === "POST")
        return await releaseMilitary(request);
      if (route === "admin/military/releases/restore" && method === "POST")
        return await restoreMilitary(request);
      if (path[1] === "military" && path.length === 3 && method === "PUT")
        return await saveMilitary(request, path[2]);
      if (route === "admin/content" && method === "POST")
        return await createContent(request);
      if (path[1] === "content" && path.length === 3 && method === "PUT")
        return await saveContent(request, path[2]);
      if (route === "admin/audit" && method === "GET") {
        const rows = await database()
          .prepare(
            "SELECT entity_id,action,detail,created_at FROM audit_events ORDER BY created_at DESC LIMIT 50",
          )
          .all();
        return respond({ events: rows.results });
      }
    }
    throw new HttpError(404, "This destination was not found.");
  } catch (error) {
    return failure(error);
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
