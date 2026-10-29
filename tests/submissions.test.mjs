// Photographer submissions over the D1 shim: retry keys, the daily limit, owner-only revision,
// compare-and-set conflicts, the ambiguous-acknowledgement reconciliation, and reviews.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DAILY_LIMIT,
  checkRevisable,
  findSubmission,
  reviewSubmission,
  writeSubmission,
} from "../lib/submissions/d1.ts";
import { d1Sqlite } from "./support/d1-sqlite.mjs";
import { memoryPhotos, submissionData } from "./support/fixtures.mjs";

const owner = "firebase:demo-airplane-games:photographer";
const editor = "firebase:demo-airplane-games:editor";
const image = (n = 1) => ({ bytes: new Uint8Array([n, 2, 3]), mime: "image/jpeg", width: 1200, height: 800, digest: `digest-${n}` });
const payload = (title = "Approach at dawn") => JSON.stringify(submissionData({ title }));
const audits = (db) => db.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events").get().n;

function setup() {
  const db = d1Sqlite();
  const photos = memoryPhotos();
  const write = (input) => writeSubmission(db, () => photos, { owner, key: "retry-key-0000000001", old: null, payload: payload(), image: image(), ...input });
  return { db, photos, write };
}

test("a new proposal stores its photo, row and one audit event", async () => {
  const { db, photos, write } = setup();
  const result = await write();
  assert.equal(result.status, 201);
  assert.equal(result.submission.status, "pending");
  assert.equal(photos.objects.size, 1);
  assert.equal(audits(db), 1);
});

test("a repeated retry key returns the first result; reused for other content it is refused", async () => {
  const { db, write } = setup();
  const first = await write();
  const again = await write();
  assert.deepEqual([again.status, again.repeated, again.submission.id], [200, true, first.submission.id]);
  await assert.rejects(write({ payload: payload("Something else") }), (e) => e.status === 409);
  assert.equal(audits(db), 1);
});

test(`the ${DAILY_LIMIT}-a-day limit refuses the next new proposal`, async () => {
  const { write } = setup();
  for (let i = 0; i < DAILY_LIMIT; i++)
    await write({ key: `retry-key-${String(i).padStart(10, "0")}`, image: image(i), payload: payload(`Photo ${i}`) });
  await assert.rejects(write({ key: "retry-key-overflow01" }), (e) => e.status === 429 && /30 proposals today/.test(e.message));
});

test("only the owner's pending or returned proposals can be revised", async () => {
  const { db, write } = setup();
  const { submission } = await write();
  const row = await findSubmission(db, submission.id);
  assert.doesNotThrow(() => checkRevisable(row, owner));
  assert.throws(() => checkRevisable(row, editor), (e) => e.status === 403);
  assert.throws(() => checkRevisable({ ...row, status: "approved" }, owner), (e) => e.status === 403);
});

test("a revision based on a stale version conflicts and removes its new photo", async () => {
  const { db, photos, write } = setup();
  const { submission } = await write();
  const stale = await findSubmission(db, submission.id);
  await write({ old: stale, image: image(2), payload: payload("First revision") });
  const before = audits(db);
  await assert.rejects(write({ old: stale, image: image(3), payload: payload("Second revision") }), (e) => e.status === 409);
  assert.equal(audits(db), before, "nothing is written");
  assert.equal(photos.objects.size, 1, "the losing upload is deleted and the winner's photo kept");
});

test("a batch that commits but reports failure is reconciled, not retried", async () => {
  const { db, photos } = setup();
  const flaky = {
    ...db,
    async batch(statements) {
      await db.batch(statements);
      throw new Error("network reset after commit");
    },
  };
  const result = await writeSubmission(flaky, () => photos, {
    owner,
    key: "retry-key-ambiguous1",
    old: null,
    payload: payload(),
    image: image(),
  });
  assert.deepEqual([result.status, result.repeated], [200, true]);
  assert.equal(photos.objects.size, 1, "the committed row keeps its photo");
});

test("a review is a compare-and-set on the proposal's version", async () => {
  const { db, write } = setup();
  const { submission } = await write();
  const checks = { rights: true, identity: true, quality: true, privacy: true, safety: true };
  await assert.rejects(
    reviewSubmission(db, editor, submission.id, { status: "rejected", note: "Not usable.", checks, version: 7 }),
    (e) => e.status === 409,
  );
  const reviewed = await reviewSubmission(db, editor, submission.id, {
    status: "changes_requested",
    note: "Please add the location.",
    checks,
    version: 1,
  });
  assert.deepEqual([reviewed.status, reviewed.version], ["changes_requested", 2]);
  // Submission and review can share a millisecond, so compare the set of actions, not their order.
  assert.deepEqual(
    db.sqlite
      .prepare("SELECT action FROM audit_events WHERE entity_id=? ORDER BY action")
      .all(submission.id)
      .map((row) => row.action),
    ["changes_requested", "submitted"],
    "one audit event for the submission and one for the review; the stale attempt wrote none",
  );
});
