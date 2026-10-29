// A D1Database stand-in over node:sqlite for unit tests: prepare/bind/first/all/run, and batch()
// as one transaction that rolls back on error, as D1 does. Applies the real drizzle migration.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const migration = new URL("../../drizzle/0000_charming_spitfire.sql", import.meta.url);

export function d1Sqlite() {
  const sqlite = new DatabaseSync(":memory:");
  for (const statement of readFileSync(migration, "utf8").split("--> statement-breakpoint"))
    if (statement.trim()) sqlite.exec(statement);

  const plain = (row) => (row ? { ...row } : null);
  const execute = (sql, params) => {
    const statement = sqlite.prepare(sql);
    if (/^\s*select/i.test(sql))
      return { success: true, results: statement.all(...params).map(plain), meta: { changes: 0 } };
    const result = statement.run(...params);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  };
  const statement = (sql, params = []) => ({
    sql,
    params,
    bind: (...values) => statement(sql, values),
    first: async () => plain(sqlite.prepare(sql).get(...params)),
    all: async () => execute(sql, params),
    run: async () => execute(sql, params),
  });

  return {
    sqlite,
    prepare: (sql) => statement(sql),
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((s) => execute(s.sql, s.params));
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
