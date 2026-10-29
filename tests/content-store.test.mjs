// The Aircraft Identifier and Plane of the Day desks (ContentStore) over the D1 shim.
import assert from "node:assert/strict";
import { test } from "node:test";
import { d1ContentStore } from "../lib/editorial/content-d1.ts";
import { EditorialConflict, EditorialInvalid, EditorialNotFound } from "../lib/editorial/store.ts";
import { d1Sqlite } from "./support/d1-sqlite.mjs";
import { seedSubmission, submissionData } from "./support/fixtures.mjs";

const actor = { principal: "firebase:demo-airplane-games:editor" };
const ready = (record, overrides = {}) => ({
  ...record.data,
  title: "Approach at dawn",
  credit: "Client Photographer",
  factualSource: "https://example.com/source",
  correctAnswer: "Boeing 767-200",
  distractors: ["Boeing 777", "Airbus A330", "Airbus A350"],
  difficulty: "Trainee",
  ...overrides,
});
const audits = (db) => db.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events").get().n;

function setup() {
  const db = d1Sqlite();
  seedSubmission(db, { id: "photo-1" });
  seedSubmission(db, { id: "pending-1", status: "pending" });
  seedSubmission(db, { id: "games-only", data: submissionData({ channels: ["games"] }) });
  seedSubmission(db, { id: "no-website", data: submissionData({ channels: ["games", "plane-of-the-day"] }) });
  seedSubmission(db, { id: "demo-1", digest: "demo:aircraft" });
  return { db, store: d1ContentStore(db) };
}

test("a draft is created from an approved photograph offered for that use", async () => {
  const { db, store } = setup();
  const record = await store.createDraft("identifier", { submissionId: "photo-1" }, actor);
  assert.deepEqual([record.kind, record.status, record.version, record.sourceId], ["identifier", "draft", 1, "photo-1"]);
  assert.equal(record.data.imageUrl, "/api/submissions/photo-1/photo");
  assert.equal(audits(db), 1);
  await assert.rejects(store.createDraft("military", { submissionId: "photo-1" }, actor), /Choose Aircraft Identifier/);
  await assert.rejects(store.createDraft("identifier", { submissionId: "" }, actor), /Choose an approved photograph/);
  await assert.rejects(store.createDraft("identifier", { submissionId: "pending-1" }, actor), /must be approved first/);
  await assert.rejects(store.createDraft("potd", { submissionId: "games-only" }, actor), /not offered for that use/);
  await assert.rejects(store.createDraft("potd", { submissionId: "nope" }, actor), EditorialNotFound);
});

test("sample drafts can be saved but never published", async () => {
  const { store } = setup();
  const sample = await store.createDraft("identifier", { sample: true }, actor);
  assert.equal(sample.id, "sample-identifier");
  const saved = await store.save(sample.id, { baseVersion: 1, status: "draft", data: sample.data }, actor);
  assert.equal(saved.version, 2);
  await assert.rejects(
    store.save(sample.id, { baseVersion: 2, status: "published", data: ready(sample) }, actor),
    /Sample content cannot be published/,
  );
});

test("publishing rules: demo sources, website permission, dates and scheduling", async () => {
  const { store } = setup();
  const demo = await store.createDraft("identifier", { submissionId: "demo-1" }, actor);
  await assert.rejects(
    store.save(demo.id, { baseVersion: 1, status: "published", data: ready(demo) }, actor),
    /Demo proposals cannot be published/,
  );
  const id = await store.createDraft("identifier", { submissionId: "photo-1" }, actor);
  await assert.rejects(
    store.save(id.id, { baseVersion: 1, status: "scheduled", data: ready(id) }, actor),
    /not daily scheduling/,
  );
  await assert.rejects(
    store.save(id.id, { baseVersion: 1, status: "published", data: ready(id, { factualSource: "" }) }, actor),
    (e) => e instanceof EditorialInvalid && /https factual source/.test(e.message),
  );
  const potd = await store.createDraft("potd", { submissionId: "no-website" }, actor);
  await assert.rejects(
    store.save(potd.id, { baseVersion: 1, status: "scheduled", data: ready(potd), dateKey: "2026-10-29" }, actor),
    /Website permission is required/,
  );
  const ok = await store.createDraft("potd", { submissionId: "photo-1" }, actor);
  await assert.rejects(
    store.save(ok.id, { baseVersion: 1, status: "scheduled", data: ready(ok), dateKey: "2026-02-30" }, actor),
    /valid feature date/,
  );
});

test("the image stays pinned to the source photograph", async () => {
  const { store } = setup();
  const record = await store.createDraft("identifier", { submissionId: "photo-1" }, actor);
  const saved = await store.save(
    record.id,
    { baseVersion: 1, status: "draft", data: ready(record, { imageUrl: "https://elsewhere.test/x.jpg" }) },
    actor,
  );
  assert.equal(saved.data.imageUrl, "/api/submissions/photo-1/photo");
});

test("a stale version conflicts and writes nothing", async () => {
  const { db, store } = setup();
  const record = await store.createDraft("identifier", { submissionId: "photo-1" }, actor);
  const before = audits(db);
  await assert.rejects(store.save(record.id, { baseVersion: 5, status: "draft", data: record.data }, actor), EditorialConflict);
  await assert.rejects(store.save("missing", { baseVersion: 1, status: "draft", data: record.data }, actor), EditorialNotFound);
  assert.equal(audits(db), before);
});

test("a source re-reviewed between the checks and the write makes publishing conflict", async () => {
  const { db, store } = setup();
  const record = await store.createDraft("potd", { submissionId: "photo-1" }, actor);
  const racing = d1ContentStore({
    ...db,
    async batch(statements) {
      db.sqlite.prepare("UPDATE submissions SET version=version+1 WHERE id='photo-1'").run();
      return db.batch(statements);
    },
  });
  const before = audits(db);
  await assert.rejects(
    racing.save(record.id, { baseVersion: 1, status: "scheduled", data: ready(record), dateKey: "2026-10-29" }, actor),
    EditorialConflict,
  );
  assert.equal(audits(db), before);
});

test("featured lists due Plane of the Day features with a credit and an approved photograph", async () => {
  const { store } = setup();
  const record = await store.createDraft("potd", { submissionId: "photo-1" }, actor);
  await store.save(record.id, { baseVersion: 1, status: "scheduled", data: ready(record), dateKey: "2026-10-28" }, actor);
  assert.equal((await store.featured("2026-10-27")).length, 0, "not yet due");
  const due = await store.featured("2026-10-29");
  assert.deepEqual(
    due.map((f) => [f.record.id, f.imageKey]),
    [[record.id, "submissions/photo-1/key"]],
  );
  assert.equal((await store.list()).length, 1);
});
