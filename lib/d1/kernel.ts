/**
 * The one D1 write pattern every desk uses: a compare-and-set that bumps `version` and stamps
 * `last_mutation`, batched with an audit event that is inserted only if that stamp landed. A
 * failed compare-and-set therefore writes nothing at all. Relative imports only.
 */
export type Table = "submissions" | "editorial_records";
export type Bindable = string | number | null;

export function auditFor(
  db: D1Database,
  table: Table,
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

export type CasUpdate = {
  table: Table;
  id: string;
  baseVersion: number;
  /** Columns to set besides version, last_mutation and updated_at. */
  set: Record<string, Bindable>;
  /** Extra conditions ANDed into the WHERE clause, with their values. */
  where?: { sql: string; values: Bindable[] };
  actor: string;
  action: string;
  detail: unknown;
  now?: string;
};

/** The UPDATE half of a compare-and-set, for callers that batch it themselves. */
export function casStatement(db: D1Database, update: CasUpdate, mutation: string, now: string) {
  const columns = Object.keys(update.set);
  const sql =
    `UPDATE ${update.table} SET ${columns.map((c) => `${c}=?`).join(",")}${columns.length ? "," : ""}` +
    `version=version+1,last_mutation=?,updated_at=? WHERE id=? AND version=?` +
    (update.where ? ` AND ${update.where.sql}` : "");
  return db
    .prepare(sql)
    .bind(
      ...columns.map((c) => update.set[c]),
      mutation,
      now,
      update.id,
      update.baseVersion,
      ...(update.where?.values ?? []),
    );
}

/** Runs the compare-and-set and its audit event as one batch. Returns whether the row changed. */
export async function casUpdate(db: D1Database, update: CasUpdate): Promise<boolean> {
  const mutation = crypto.randomUUID(),
    now = update.now ?? new Date().toISOString();
  const results = await db.batch([
    casStatement(db, update, mutation, now),
    auditFor(db, update.table, update.actor, update.id, mutation, update.action, update.detail),
  ]);
  return results[0].meta.changes > 0;
}
