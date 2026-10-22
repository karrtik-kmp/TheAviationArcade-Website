import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const submissions = sqliteTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    requestKey: text("request_key").notNull().unique(),
    payload: text("payload").notNull(),
    imageKey: text("image_key").notNull(),
    imageMime: text("image_mime").notNull(),
    imageBytes: integer("image_bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    digest: text("digest").notNull(),
    status: text("status").notNull().default("pending"),
    reviewNote: text("review_note").notNull().default(""),
    checks: text("checks").notNull().default("{}"),
    version: integer("version").notNull().default(1),
    lastMutation: text("last_mutation").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("submission_owner").on(t.ownerId),
    index("submission_status").on(t.status),
  ],
);
export const editorialRecords = sqliteTable(
  "editorial_records",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    sourceId: text("source_id"),
    payload: text("payload").notNull(),
    status: text("status").notNull().default("draft"),
    dateKey: text("date_key"),
    version: integer("version").notNull().default(1),
    lastMutation: text("last_mutation").notNull().default(""),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("editorial_kind").on(t.kind)],
);
export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  createdAt: text("created_at").notNull(),
});
