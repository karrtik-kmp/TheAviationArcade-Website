/**
 * Photographer submissions in D1 and private photo storage. These are community data that stay on
 * the website (D-2), so they are not part of EditorialStore. Writes go through the shared
 * compare-and-set kernel. Relative imports only, so `node --test` can load this module.
 */
import { HttpError } from "../errors.ts";
import { auditFor, casStatement, casUpdate } from "../d1/kernel.ts";
import { sampleEditorialData } from "../demo-samples.ts";
import { reviewError } from "../rules.ts";
import type { PhotoStorage } from "../photo-storage.ts";
import type { ReviewChecks, Submission, SubmissionData, SubmissionStatus } from "../types.ts";

export type Row = Record<string, string | number | null>;
const idPattern = /^[a-zA-Z0-9-]{1,80}$/;
/** Submissions a photographer may add per rolling day. */
export const DAILY_LIMIT = 30;

function demoPhoto(row: Row) {
  return row.digest === "demo:aircraft"
    ? "/media/aircraft.jpg"
    : row.digest === "demo:atc"
      ? "/media/potd-6.jpg"
      : null;
}
export function submissionView(row: Row): Submission {
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

export async function findSubmission(db: D1Database, id: string) {
  if (!idPattern.test(id)) throw new HttpError(404, "Submission not found.");
  const row = await db.prepare("SELECT * FROM submissions WHERE id = ?").bind(id).first<Row>();
  if (!row) throw new HttpError(404, "Submission not found.");
  return row;
}

export async function ownSubmissions(db: D1Database, owner: string) {
  const rows = await db
    .prepare("SELECT * FROM submissions WHERE owner_id=? ORDER BY created_at DESC LIMIT 100")
    .bind(owner)
    .all<Row>();
  return rows.results.map(submissionView);
}
export async function allSubmissions(db: D1Database) {
  const rows = await db
    .prepare("SELECT * FROM submissions ORDER BY created_at DESC LIMIT 200")
    .all<Row>();
  return rows.results.map(submissionView);
}

/** Only the owner's pending or returned proposals can be revised. */
export function checkRevisable(old: Row | null, owner: string) {
  if (old && (old.owner_id !== owner || !["pending", "changes_requested"].includes(String(old.status))))
    throw new HttpError(403, "Only your pending or returned proposals can be revised.");
}

export type NewImage = { bytes: Uint8Array; mime: string; width: number; height: number; digest: string };
export type SubmissionWrite = {
  owner: string;
  /** The client's Idempotency-Key. */
  key: string;
  /** The stored row being revised, or null for a new proposal. */
  old: Row | null;
  /** Canonical JSON of the validated form. */
  payload: string;
  image: NewImage | null;
};
export type SubmissionResult = { submission: Submission; repeated?: true; status: 200 | 201 };

/**
 * Stores a new proposal or a revision. A repeated retry key returns the earlier result; a key
 * reused for different content is refused. New photo bytes are written before the row, and are
 * deleted again only once the database confirms no row points at them.
 */
export async function writeSubmission(
  db: D1Database,
  photos: () => PhotoStorage,
  input: SubmissionWrite,
): Promise<SubmissionResult> {
  const { owner, key, old, payload, image } = input;
  let imageKey = String(old?.image_key ?? ""),
    mime = String(old?.image_mime ?? ""),
    size = Number(old?.image_bytes ?? 0),
    width = Number(old?.width ?? 0),
    height = Number(old?.height ?? 0),
    digest = String(old?.digest ?? "");
  if (image) {
    ({ mime, width, height, digest } = image);
    size = image.bytes.length;
  }
  const requestKey = owner + ":" + key;
  if (!old) {
    const repeated = await db
      .prepare("SELECT * FROM submissions WHERE request_key = ?")
      .bind(requestKey)
      .first<Row>();
    if (repeated) {
      if (repeated.digest !== digest || repeated.payload !== payload)
        throw new HttpError(409, "This retry key belongs to a different proposal. Start a new submission.");
      return { submission: submissionView(repeated), repeated: true, status: 200 };
    }
    const count = await db
      .prepare("SELECT COUNT(*) AS count FROM submissions WHERE owner_id = ? AND created_at > ?")
      .bind(owner, new Date(Date.now() - 86400000).toISOString())
      .first<{ count: number }>();
    if ((count?.count ?? 0) >= DAILY_LIMIT)
      throw new HttpError(429, "You've reached 30 proposals today. Please return tomorrow.");
  }
  const recordId = old ? String(old.id) : crypto.randomUUID(),
    mutation = crypto.randomUUID(),
    now = new Date().toISOString();
  const previousKey = imageKey;
  if (image) {
    imageKey = `submissions/${recordId}/${crypto.randomUUID()}`;
    await photos().put(imageKey, image.bytes, { httpMetadata: { contentType: mime } });
  }
  try {
    const statement = old
      ? casStatement(
          db,
          {
            table: "submissions",
            id: recordId,
            baseVersion: Number(old.version),
            set: {
              payload,
              image_key: imageKey,
              image_mime: mime,
              image_bytes: size,
              width,
              height,
              digest,
              status: "pending",
              checks: "{}",
              review_note: "",
            },
            where: { sql: "owner_id=? AND status IN ('pending','changes_requested')", values: [owner] },
            actor: owner,
            action: "resubmitted",
            detail: null,
          },
          mutation,
          now,
        )
      : db
          .prepare(
            "INSERT INTO submissions (id,owner_id,request_key,payload,image_key,image_mime,image_bytes,width,height,digest,status,review_note,checks,version,last_mutation,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'pending','','{}',1,?,?,?)",
          )
          .bind(recordId, owner, requestKey, payload, imageKey, mime, size, width, height, digest, mutation, now, now);
    const results = await db.batch([
      statement,
      auditFor(db, "submissions", owner, recordId, mutation, old ? "resubmitted" : "submitted", {
        version: Number(old?.version ?? 0) + 1,
      }),
    ]);
    if (!results[0].meta.changes) throw new HttpError(409, "This proposal changed. Refresh and try again.");
  } catch (error) {
    // Resolve an ambiguous database acknowledgement before deleting uploaded bytes.
    // If the database is unavailable, retain the object for later reconciliation.
    const winner = old
      ? await db.prepare("SELECT * FROM submissions WHERE id=? AND owner_id=?").bind(recordId, owner).first<Row>()
      : await db.prepare("SELECT * FROM submissions WHERE request_key=?").bind(requestKey).first<Row>();
    if (image && (!winner || winner.image_key !== imageKey)) await photos().delete(imageKey);
    if (
      winner &&
      ((!old && winner.payload === payload && winner.digest === digest) ||
        (old && winner.last_mutation === mutation))
    )
      return { submission: submissionView(winner), repeated: true, status: 200 };
    if (winner && !old)
      throw new HttpError(409, "This retry key belongs to a different proposal. Start a new submission.");
    throw error;
  }
  if (image && previousKey)
    await photos()
      .delete(previousKey)
      .catch(() => undefined);
  return { submission: submissionView(await findSubmission(db, recordId)), status: old ? 200 : 201 };
}

/** A staff review decision on one proposal, compare-and-set on its version. */
export async function reviewSubmission(
  db: D1Database,
  actor: string,
  id: string,
  body: { status?: unknown; note?: unknown; checks?: unknown; version?: unknown },
) {
  const row = await findSubmission(db, id);
  const next = body.status as SubmissionStatus,
    note = typeof body.note === "string" ? body.note.trim().slice(0, 2400) : "";
  const checks = (body.checks ?? {}) as Partial<ReviewChecks>;
  if (body.version !== Number(row.version))
    throw new HttpError(409, "Another editor changed this proposal. Refresh to see their changes.");
  const error = reviewError(JSON.parse(String(row.payload)), row.status as SubmissionStatus, next, checks, note);
  if (error) throw new HttpError(422, error);
  const changed = await casUpdate(db, {
    table: "submissions",
    id,
    baseVersion: Number(body.version),
    set: { status: next, review_note: note, checks: JSON.stringify(checks) },
    actor,
    action: next,
    detail: { from: row.status, note, checks },
  });
  if (!changed) throw new HttpError(409, "This proposal changed. Refresh before reviewing it.");
  return submissionView(await findSubmission(db, id));
}

/** Seeds the two sample proposals and the two sample drafts. They can never be published. */
export async function loadDemoData(db: D1Database, actor: string) {
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  for (const kind of ["aircraft", "atc"] as const) {
    const id = `demo-submission-${kind}`,
      mutation = crypto.randomUUID();
    const data: SubmissionData = {
      title: kind === "aircraft" ? "KLM on approach [Demo]" : "Airport operations reference [Demo]",
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
      db
        .prepare(
          "INSERT OR IGNORE INTO submissions (id,owner_id,request_key,payload,image_key,image_mime,image_bytes,width,height,digest,status,review_note,checks,version,last_mutation,created_at,updated_at) VALUES (?,?,?,?,?,'image/jpeg',0,1280,960,?,'pending','Demo data: factual review and publication rights are unverified.','{}',1,?,?,?)",
        )
        .bind(id, actor, id, JSON.stringify(data), `demo-${kind}`, `demo:${kind}`, mutation, now, now),
    );
    statements.push(auditFor(db, "submissions", actor, id, mutation, "demo_loaded", { sample: true }));
  }
  for (const kind of ["identifier", "potd"] as const) {
    const id = `sample-${kind}`,
      mutation = crypto.randomUUID();
    statements.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO editorial_records (id,kind,source_id,payload,status,date_key,version,last_mutation,updated_at) VALUES (?,?,NULL,?,'draft',NULL,1,?,?)",
        )
        .bind(id, kind, JSON.stringify(sampleEditorialData(kind)), mutation, now),
    );
    statements.push(auditFor(db, "editorial_records", actor, id, mutation, "demo_draft_loaded", { sample: true }));
  }
  await db.batch(statements);
}
