/**
 * D1 adapter for ContentStore. The publishing rules and messages are the ones the API route used:
 * publishing needs an approved, non-demo source offered for the channel, Plane of the Day needs
 * website permission and a valid date, Aircraft Identifier is never scheduled, and the image stays
 * pinned to the source. Writes go through the shared compare-and-set kernel.
 */
import { auditFor, casUpdate } from "../d1/kernel.ts";
import { editorialErrors, validDate } from "../rules.ts";
import type { EditorialData, EditorialRecord, SubmissionData } from "../types.ts";
import { isContentData, type ContentKind, type ContentStore } from "./content.ts";
import { EditorialConflict, EditorialInvalid, EditorialNotFound } from "./store.ts";

type Row = Record<string, string | number | null>;
const idPattern = /^[a-zA-Z0-9-]{1,80}$/;

export function recordView(row: Row): EditorialRecord {
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

/** The client-supplied preview photograph used for sample drafts. Never publishable. */
function sampleData(kind: ContentKind): EditorialData {
  return {
    title: kind === "identifier" ? "Identify this aircraft" : "Threshold Geometry",
    aircraft: kind === "identifier" ? "Boeing 767-200" : "Boeing 757",
    photographer: "Josh M",
    credit: "Josh M (@iamjoshmark)",
    description:
      "Client-supplied preview photograph. Website permission and factual review are still required before publication.",
    correctAnswer: "Boeing 767-200",
    distractors: ["Boeing 777", "Airbus A330", "Airbus A350"],
    difficulty: "Trainee",
    factualSource: "",
    imageUrl: kind === "identifier" ? "/media/aircraft.jpg" : "/media/potd-6.jpg",
  };
}

export function d1ContentStore(db: D1Database): ContentStore {
  async function submission(id: string) {
    if (!idPattern.test(id)) throw new EditorialNotFound("Submission not found.");
    const row = await db.prepare("SELECT * FROM submissions WHERE id = ?").bind(id).first<Row>();
    if (!row) throw new EditorialNotFound("Submission not found.");
    return row;
  }
  async function record(id: string) {
    return db.prepare("SELECT * FROM editorial_records WHERE id=?").bind(id).first<Row>();
  }

  return {
    async list() {
      const rows = await db
        .prepare(
          "SELECT * FROM editorial_records WHERE kind IN ('identifier','potd') ORDER BY updated_at DESC LIMIT 200",
        )
        .all<Row>();
      return rows.results.map(recordView);
    },

    async createDraft(kind, from, actor) {
      if (kind !== "identifier" && kind !== "potd")
        throw new EditorialInvalid("Choose Aircraft Identifier or Plane of the Day.");
      const source = "submissionId" in from && from.submissionId ? await submission(String(from.submissionId)) : null;
      if (!source && !("sample" in from && from.sample === true))
        throw new EditorialInvalid("Choose an approved photograph.");
      if (source && source.status !== "approved")
        throw new EditorialInvalid("The photograph must be approved first.");
      const submitted: SubmissionData | null = source ? JSON.parse(String(source.payload)) : null;
      const channel = kind === "identifier" ? "games" : "plane-of-the-day";
      if (submitted && !submitted.channels.includes(channel))
        throw new EditorialInvalid("This photograph was not offered for that use.");
      const id = source ? crypto.randomUUID() : `sample-${kind}`,
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
        : sampleData(kind);
      const statement = source
        ? db
            .prepare(
              "INSERT INTO editorial_records (id,kind,source_id,payload,status,date_key,version,last_mutation,updated_at) SELECT ?,?,?,?,'draft',NULL,1,?,? FROM submissions WHERE id=? AND status='approved' AND version=?",
            )
            .bind(id, kind, source.id, JSON.stringify(data), mutation, now, source.id, source.version)
        : db
            .prepare(
              "INSERT OR IGNORE INTO editorial_records (id,kind,source_id,payload,status,date_key,version,last_mutation,updated_at) VALUES (?,?,NULL,?,'draft',NULL,1,?,?)",
            )
            .bind(id, kind, JSON.stringify(data), mutation, now);
      await db.batch([
        statement,
        auditFor(db, "editorial_records", actor.principal, id, mutation, "draft_created", {
          sourceId: source?.id ?? null,
        }),
      ]);
      const created = await record(id);
      // The source photograph changed between the check and the insert.
      if (!created) throw new EditorialConflict("The photograph changed. Refresh before creating content.");
      return recordView(created);
    },

    async save(id, input, actor) {
      const row = await record(id);
      if (!row) throw new EditorialNotFound("Content not found.");
      if (input.baseVersion !== Number(row.version))
        throw new EditorialConflict("This content changed. Refresh before saving.");
      if (!["draft", "scheduled", "published", "archived"].includes(input.status as string))
        throw new EditorialInvalid("Unknown content state.");
      if (!isContentData(input.data)) throw new EditorialInvalid("Check the content fields.");
      const data = input.data;
      if (Object.values(data).some((v) => typeof v === "string" && v.length > 2400))
        throw new EditorialInvalid("Keep each text field under 2,400 characters.");
      const status = input.status as EditorialRecord["status"],
        kind = row.kind as ContentKind;
      let source: Row | null = null;
      if (status === "scheduled" || status === "published") {
        const errors = editorialErrors(kind, data);
        if (errors.length) throw new EditorialInvalid(errors.join(" "));
        if (!row.source_id)
          throw new EditorialInvalid(
            "Sample content cannot be published. Use an approved community submission with verified rights.",
          );
        source = await submission(String(row.source_id));
        const sd: SubmissionData = JSON.parse(String(source.payload));
        if (String(source.digest).startsWith("demo:"))
          throw new EditorialInvalid(
            "Demo proposals cannot be published. Use a real submission with separately verified permission.",
          );
        if (source.status !== "approved" || !sd.channels.includes(kind === "potd" ? "plane-of-the-day" : "games"))
          throw new EditorialInvalid("The source photograph is no longer approved for this use.");
        if (kind === "potd" && !sd.channels.includes("website"))
          throw new EditorialInvalid("Website permission is required to publish this photograph on the prototype.");
        if (kind === "potd" && !validDate((input.dateKey as string) ?? ""))
          throw new EditorialInvalid("Choose a valid feature date.");
        if (kind === "identifier" && status === "scheduled")
          throw new EditorialInvalid(
            "Aircraft Identifier supports draft or prototype-ready content, not daily scheduling.",
          );
      }
      // Media and attribution stay linked to the verified submission, never arbitrary image URLs.
      const stored = { ...data, imageUrl: JSON.parse(String(row.payload)).imageUrl };
      const changed = await casUpdate(db, {
        table: "editorial_records",
        id,
        baseVersion: Number(input.baseVersion),
        set: {
          payload: JSON.stringify(stored),
          status,
          date_key: kind === "potd" ? ((input.dateKey as string | undefined) ?? null) : null,
        },
        where: {
          sql: "(? IS NULL OR EXISTS (SELECT 1 FROM submissions WHERE id=? AND status='approved' AND version=?))",
          values: [source?.id ?? null, source?.id ?? null, source?.version ?? 0],
        },
        actor: actor.principal,
        action: "content_" + status,
        detail: { version: Number(input.baseVersion) + 1, date: input.dateKey ?? null },
      });
      if (!changed) throw new EditorialConflict("This content or its photograph changed. Refresh before saving.");
      return recordView((await record(id))!);
    },

    async featured(day) {
      const rows = await db
        .prepare(
          "SELECT e.*,s.image_key,s.image_mime FROM editorial_records e JOIN submissions s ON e.source_id=s.id WHERE e.kind='potd' AND e.status IN ('published','scheduled') AND e.date_key<=? AND s.status='approved' ORDER BY e.date_key DESC,e.updated_at DESC LIMIT 100",
        )
        .bind(day)
        .all<Row>();
      return rows.results
        .filter((row) => !!JSON.parse(String(row.payload)).credit)
        .map((row) => ({
          record: recordView(row),
          imageKey: String(row.image_key),
          imageMime: String(row.image_mime),
        }));
    },
  };
}
