/**
 * D1 adapter for EditorialStore. Every mutation is one batch: a compare-and-set write plus its
 * audit event, which auditFor inserts only if the write stamped this mutation's id. A failed
 * compare-and-set therefore writes nothing at all.
 */
import { militaryRoster, type MilitaryAircraft, type MilitaryStage } from "../military.ts";
import type { SubmissionData } from "../types.ts";
import {
  EditorialConflict,
  LIVE_CHANGED,
  RELEASE_CHANGED,
  checkDesk,
  draftAudit,
  draftPhotoGuard,
  itemOf,
  linkedIds,
  packagesOf,
  planActivate,
  planDraft,
  planRestore,
  planUpload,
  summaryOf,
  type Actor,
  type EditorialItem,
  type EditorialStore,
  type LinkedPhoto,
  type LiveState,
  type ReleaseSnapshot,
  type ReleaseSummary,
} from "./store.ts";

type Row = Record<string, string | number | null>;
const POINTER_ID = "military-release-current";
const recordId = (aircraftId: string) => `military-${aircraftId}`;
const releaseId = (n: number) => `military-release-${n}`;

export function auditFor(
  db: D1Database,
  table: "submissions" | "editorial_records",
  actor: string,
  id: string,
  mutation: string,
  action: string,
  detail: unknown,
) {
  return db
    .prepare(
      `INSERT INTO audit_events (id, actor_id, entity_id, action, detail, created_at) SELECT ?, ?, ?, ?, ?, ? FROM ${table} WHERE id = ? AND last_mutation = ?`,
    )
    .bind(mutation, actor, id, action, JSON.stringify(detail), new Date().toISOString(), id, mutation);
}

function photoOf(row: Row): LinkedPhoto {
  return {
    id: String(row.id),
    version: Number(row.version),
    status: String(row.status),
    games: (JSON.parse(String(row.payload)) as SubmissionData).channels.includes("games"),
    demo: String(row.digest).startsWith("demo:"),
    bytes: Number(row.image_bytes),
    digest: String(row.digest),
  };
}

/** The candidate's package versions are still the stored ones (exact ids, in id order). */
const PACKAGES_UNCHANGED =
  "(SELECT group_concat(id || ':' || version, ',') FROM (SELECT id,version FROM editorial_records WHERE kind='military' AND id IN (SELECT value FROM json_each(?)) ORDER BY id)) IS ?";
/** Every linked contribution is still approved at the version the candidate was checked against. */
const PHOTOS_UNCHANGED =
  "(SELECT COUNT(*) FROM submissions s JOIN json_each(?) j ON s.id = json_extract(j.value,'$.id') AND s.version = json_extract(j.value,'$.version') WHERE s.status='approved') = ?";

function snapshotGuards(snapshot: ReleaseSnapshot) {
  const ids = snapshot.packages.map((p) => recordId(p.aircraftId)).sort();
  const versions = new Map(snapshot.packages.map((p) => [recordId(p.aircraftId), p.version]));
  const photos = [
    ...new Map(
      snapshot.packages.map((p) => [p.submissionId, { id: p.submissionId, version: p.submissionVersion ?? -1 }]),
    ).values(),
  ];
  return {
    sql: `${PACKAGES_UNCHANGED} AND ${PHOTOS_UNCHANGED}`,
    values: [
      JSON.stringify(ids),
      ids.map((id) => `${id}:${versions.get(id)}`).join(","),
      JSON.stringify(photos),
      photos.length,
    ],
  };
}

export function d1EditorialStore(
  db: D1Database,
  options: { roster?: MilitaryAircraft[] } = {},
): EditorialStore {
  const roster = options.roster ?? militaryRoster;

  async function read() {
    const [packages, releases, pointer] = await Promise.all([
      db.prepare("SELECT * FROM editorial_records WHERE kind='military' ORDER BY id").all<Row>(),
      db
        .prepare(
          "SELECT id,status,payload FROM editorial_records WHERE kind='military_release' ORDER BY updated_at DESC LIMIT 50",
        )
        .all<Row>(),
      db
        .prepare("SELECT * FROM editorial_records WHERE id=? AND kind='military_pointer'")
        .bind(POINTER_ID)
        .first<Row>(),
    ]);
    const saved = new Map(packages.results.map((row) => [String(row.id), row]));
    const items: EditorialItem[] = roster.map((a) => {
      const row = saved.get(recordId(a.id));
      return itemOf(
        a,
        row && {
          stage: row.status as MilitaryStage,
          evidence: JSON.parse(String(row.payload)),
          version: Number(row.version),
          updatedAt: String(row.updated_at),
        },
      );
    });
    const live: LiveState = {
      ...(pointer ? JSON.parse(String(pointer.payload)) : { current: null, history: [] }),
      version: pointer ? Number(pointer.version) : 0,
      releases: releases.results.map((row) =>
        summaryOf(JSON.parse(String(row.payload)), row.status === "uploaded" ? "uploaded" : "released"),
      ),
    };
    return { items, live, pointerExists: !!pointer };
  }

  async function photos(ids: string[]) {
    const found = new Map<string, LinkedPhoto>();
    if (!ids.length) return found;
    const rows = await db
      .prepare(
        "SELECT id,status,payload,digest,image_bytes,version FROM submissions WHERE id IN (SELECT value FROM json_each(?))",
      )
      .bind(JSON.stringify(ids))
      .all<Row>();
    for (const row of rows.results) found.set(String(row.id), photoOf(row));
    return found;
  }

  return {
    async list(desk) {
      checkDesk(desk);
      const { items, live } = await read();
      return { items, live };
    },

    async saveDraft(desk, id, input, actor: Actor) {
      checkDesk(desk);
      const row = roster.some((a) => a.id === id)
        ? await db
            .prepare("SELECT * FROM editorial_records WHERE id=? AND kind='military'")
            .bind(recordId(id))
            .first<Row>()
        : null;
      const aircraft = roster.find((a) => a.id === id);
      const current =
        aircraft && row
          ? itemOf(aircraft, {
              stage: row.status as MilitaryStage,
              evidence: JSON.parse(String(row.payload)),
              version: Number(row.version),
              updatedAt: String(row.updated_at),
            })
          : undefined;
      const plan = planDraft(roster, id, input, current);
      const photo = plan.submissionId ? ((await photos([plan.submissionId])).get(plan.submissionId) ?? null) : null;
      const guard = draftPhotoGuard(plan, photo);
      const rid = recordId(plan.aircraft.id),
        mutation = crypto.randomUUID(),
        now = new Date().toISOString(),
        baseVersion = current?.version ?? 0;
      const write = row
        ? db
            .prepare(
              "UPDATE editorial_records SET source_id=?,payload=?,status=?,version=version+1,last_mutation=?,updated_at=? WHERE id=? AND kind='military' AND version=? AND (? IS NULL OR EXISTS (SELECT 1 FROM submissions WHERE id=? AND status='approved' AND version=?))",
            )
            .bind(
              photo?.id ?? null,
              plan.payload,
              plan.to,
              mutation,
              now,
              rid,
              baseVersion,
              guard?.id ?? null,
              guard?.id ?? null,
              guard?.version ?? 0,
            )
        : db
            .prepare(
              "INSERT INTO editorial_records (id,kind,source_id,payload,status,date_key,version,last_mutation,updated_at) SELECT ?,'military',?,?,?,NULL,1,?,? WHERE NOT EXISTS (SELECT 1 FROM editorial_records WHERE id=?) AND (? IS NULL OR EXISTS (SELECT 1 FROM submissions WHERE id=? AND status='approved' AND version=?))",
            )
            .bind(
              rid,
              photo?.id ?? null,
              plan.payload,
              plan.to,
              mutation,
              now,
              rid,
              guard?.id ?? null,
              guard?.id ?? null,
              guard?.version ?? 0,
            );
      const { action, detail } = draftAudit(plan, baseVersion);
      const results = await db.batch([
        write,
        auditFor(db, "editorial_records", actor.principal, rid, mutation, action, detail),
      ]);
      if (!results[0].meta.changes)
        throw new EditorialConflict("This package or its photograph changed. Refresh before saving.");
      return itemOf(plan.aircraft, {
        stage: plan.to,
        evidence: plan.evidence,
        version: baseVersion + 1,
        updatedAt: now,
      });
    },

    async upload(desk, input, actor) {
      checkDesk(desk);
      const { items, live } = await read();
      const linked = await photos(linkedIds(packagesOf(items)));
      const now = new Date().toISOString();
      const snapshot = planUpload(roster, items, live, linked, input, now);
      const id = releaseId(snapshot.number),
        mutation = crypto.randomUUID(),
        guards = snapshotGuards(snapshot);
      // The candidate is stored only if its number is free and nothing changed since the checks above.
      const results = await db.batch([
        db
          .prepare(
            `INSERT INTO editorial_records (id,kind,source_id,payload,status,date_key,version,last_mutation,updated_at) SELECT ?,'military_release',NULL,?,'uploaded',NULL,1,?,? WHERE NOT EXISTS (SELECT 1 FROM editorial_records WHERE id=?) AND ${guards.sql}`,
          )
          .bind(id, JSON.stringify(snapshot), mutation, now, id, ...guards.values),
        auditFor(db, "editorial_records", actor.principal, id, mutation, "military_release_uploaded", {
          release: snapshot.number,
          aircraft: snapshot.packages.length,
        }),
      ]);
      if (!results[0].meta.changes) throw new EditorialConflict(RELEASE_CHANGED);
      return summaryOf(snapshot, "uploaded");
    },

    async activate(desk, input, actor) {
      checkDesk(desk);
      const { live, pointerExists } = await read();
      const number = Number(input.release);
      const row = Number.isInteger(number)
        ? await db
            .prepare("SELECT status,payload FROM editorial_records WHERE id=? AND kind='military_release'")
            .bind(releaseId(number))
            .first<Row>()
        : null;
      const snapshot: ReleaseSnapshot | null = row ? JSON.parse(String(row.payload)) : null;
      const candidate: ReleaseSummary | undefined = snapshot
        ? summaryOf(snapshot, row!.status === "uploaded" ? "uploaded" : "released")
        : undefined;
      const pointer = planActivate(live, candidate, input);
      const mutation = crypto.randomUUID(),
        now = new Date().toISOString(),
        guards = snapshotGuards(snapshot!),
        stillCandidate = `EXISTS (SELECT 1 FROM editorial_records WHERE id=? AND kind='military_release' AND status='uploaded')`,
        values = [releaseId(number), ...guards.values];
      // The pointer moves only if the candidate's packages and photographs are exactly as uploaded.
      const move = pointerExists
        ? db
            .prepare(
              `UPDATE editorial_records SET payload=?,version=version+1,last_mutation=?,updated_at=? WHERE id=? AND kind='military_pointer' AND version=? AND ${stillCandidate} AND ${guards.sql}`,
            )
            .bind(JSON.stringify(pointer), mutation, now, POINTER_ID, live.version, ...values)
        : db
            .prepare(
              `INSERT INTO editorial_records (id,kind,source_id,payload,status,date_key,version,last_mutation,updated_at) SELECT ?,'military_pointer',NULL,?,'current',NULL,1,?,? WHERE NOT EXISTS (SELECT 1 FROM editorial_records WHERE id=?) AND ${stillCandidate} AND ${guards.sql}`,
            )
            .bind(POINTER_ID, JSON.stringify(pointer), mutation, now, POINTER_ID, ...values);
      const results = await db.batch([
        move,
        db
          .prepare(
            "UPDATE editorial_records SET status='released' WHERE id=? AND kind='military_release' AND EXISTS (SELECT 1 FROM editorial_records WHERE id=? AND last_mutation=?)",
          )
          .bind(releaseId(number), POINTER_ID, mutation),
        auditFor(db, "editorial_records", actor.principal, POINTER_ID, mutation, "military_released", {
          release: number,
          previous: live.current,
          aircraft: snapshot!.packages.length,
        }),
      ]);
      if (!results[0].meta.changes) throw new EditorialConflict(RELEASE_CHANGED);
      return (await read()).live;
    },

    async restore(desk, input, actor) {
      checkDesk(desk);
      const { live, pointerExists } = await read();
      const pointer = planRestore(live, input, pointerExists);
      const mutation = crypto.randomUUID(),
        now = new Date().toISOString();
      const results = await db.batch([
        db
          .prepare(
            "UPDATE editorial_records SET payload=?,version=version+1,last_mutation=?,updated_at=? WHERE id=? AND kind='military_pointer' AND version=?",
          )
          .bind(JSON.stringify(pointer), mutation, now, POINTER_ID, live.version),
        auditFor(db, "editorial_records", actor.principal, POINTER_ID, mutation, "military_release_restored", {
          release: pointer.current,
          replaced: live.current,
        }),
      ]);
      if (!results[0].meta.changes) throw new EditorialConflict(LIVE_CHANGED);
      return (await read()).live;
    },
  };
}
