import assert from "node:assert/strict";
import { test } from "node:test";
import { sampleEditorialRecords } from "../lib/demo-samples.ts";
import { matchesDemoPrincipal } from "../lib/demo-policy.ts";

test("demo account sees only the nonpublishable admin sample drafts", () => {
  const records = sampleEditorialRecords();
  assert.deepEqual(records.map((record) => record.id), ["sample-identifier", "sample-potd"]);
  for (const record of records) {
    assert.equal(record.sourceId, null);
    assert.equal(record.status, "draft");
    assert.match(record.data.title, /\[Demo\]$/);
  }
});
test("only the exact configured namespaced demo UID removes live capabilities", () => {
  assert.equal(matchesDemoPrincipal("firebase:project:demo", "project", "demo"), true);
  for (const user of ["firebase:other:demo", "firebase:project:staff", "demo", undefined])
    assert.equal(matchesDemoPrincipal(user, "project", "demo"), false);
  assert.equal(matchesDemoPrincipal("firebase:project:demo", "project", undefined), false);
});
