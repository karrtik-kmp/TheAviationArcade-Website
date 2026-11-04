// The pure core of the D1 -> backend media export: the SQL, the row -> entry decisions, the copied backend
// schema, and the rule that matters most: a manifest the backend would refuse as a whole is never produced.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ENTRY_KEYS,
  EXPORT_SQL,
  MAX_IMAGE_BYTES,
  MAX_MANIFEST_BYTES,
  PAYLOAD_FIELDS,
  VERIFY_SQL,
  buildManifest,
  checkImage,
  compareState,
  exportState,
  finishEntry,
  ownerCheck,
  parseManifest,
  planEntry,
  sha256Hex,
  sniffType,
  summarise,
  uidOfAccountPrincipal,
} from "../lib/submissions/export.ts";
import { loadDemoData, writeSubmission } from "../lib/submissions/d1.ts";
import { d1Sqlite } from "./support/d1-sqlite.mjs";
import { memoryPhotos, submissionData } from "./support/fixtures.mjs";

const PROJECT = "demo-airplane-games";
const OWNER = `firebase:${PROJECT}:photographer`;
const NOW = new Date("2026-11-04T12:00:00.000Z");
const ctx = { project: PROJECT, now: NOW };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const DIGEST = sha256Hex(JPEG);
const UUID = "123e4567-e89b-12d3-a456-426614174000";

/** A row shaped like an EXPORT_SQL result. `payload` is an object (typed per field) or null for invalid JSON. */
function rowOf(over = {}, payload = { rightsBasis: "owner", credit: "J. Smith" }) {
  const row = {
    id: "abc-1",
    owner_id: OWNER,
    status: "pending",
    version: 1,
    image_key: `submissions/abc-1/${UUID}`,
    image_mime: "image/jpeg",
    image_bytes: 1000,
    width: 1200,
    height: 800,
    digest: DIGEST,
    created_at: "2026-11-01T10:00:00.000Z",
    payload_ok: payload === null ? 0 : 1,
  };
  for (const f of PAYLOAD_FIELDS) {
    const v = payload === null ? undefined : payload[f];
    row[`${f}_type`] = v === undefined || payload === null ? null : typeof v === "string" ? "text" : v === null ? "null" : typeof v === "number" ? "integer" : "object";
    row[f] = row[`${f}_type`] === "text" ? v : row[`${f}_type`] === null ? null : JSON.stringify(v);
  }
  return { ...row, ...over };
}

/** Plan + download checks + finish: the whole per-row pipeline with in-memory bytes. */
function exportRow(row, bytes = JPEG, over = ctx) {
  const plan = planEntry(row, over);
  if (!plan.ok) return { skipped: plan.reasons };
  const checked = checkImage(plan.draft, bytes);
  if (!checked.ok) return { skipped: [checked.reason] };
  const done = finishEntry(plan.draft, checked, plan.draft.entry.sha256);
  if (!done.ok) return { skipped: [done.reason] };
  return { entry: done.entry, draft: plan.draft, warnings: done.warnings };
}

// ---- the SQL ----

test("EXPORT_SQL selects named columns only: no star, no bare payload, no email or personal columns", () => {
  assert.ok(!EXPORT_SQL.includes("*"));
  assert.ok(!/\bemail\b/i.test(EXPORT_SQL));
  assert.ok(!/photographer/i.test(EXPORT_SQL));
  assert.ok(!/review_note/i.test(EXPORT_SQL));
  assert.ok(!/request_key/i.test(EXPORT_SQL));
  // `payload` may only appear as the argument of json_valid/json_type/json_extract, and in the alias payload_ok.
  const rest = EXPORT_SQL.replace(/json_(valid|type|extract)\(payload[^)]*\)/g, "").replace(/payload_ok/g, "");
  assert.ok(!/\bpayload\b/.test(rest), rest);
  for (const f of PAYLOAD_FIELDS) assert.ok(EXPORT_SQL.includes(`'$.${f}'`));
  assert.match(EXPORT_SQL, /FROM submissions ORDER BY created_at, id$/);
  assert.ok(!/\*|payload|email|owner_id|review/i.test(VERIFY_SQL.replace("id, version, status", "")));
});

test("EXPORT_SQL runs on the real schema and returns typed fields, never the raw payload or email", async () => {
  const db = d1Sqlite();
  const photos = memoryPhotos();
  await writeSubmission(db, () => photos, {
    owner: OWNER,
    key: "retry-key-0000000001",
    old: null,
    payload: JSON.stringify(submissionData({ credit: "J. Smith", airline: "" })),
    image: { bytes: JPEG, mime: "image/jpeg", width: 1200, height: 800, digest: DIGEST },
  });
  const rows = db.sqlite.prepare(EXPORT_SQL).all();
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.payload_ok, 1);
  assert.equal(row.credit_type, "text");
  assert.equal(row.airline_type, "text");
  assert.ok(!("payload" in row) && !("email" in row) && !("photographer" in row) && !("review_note" in row) && !("request_key" in row));
  assert.ok(!JSON.stringify(row).includes("photographer@example.com"));
  // writeSubmission stamps created_at with the real clock, so check against the real clock too
  // (the fixed NOW would make this row "in the future" once the wall clock passes it).
  const plan = planEntry(row, { ...ctx, now: new Date() });
  assert.equal(plan.ok, true);
  assert.equal(plan.draft.entry.airline, undefined); // blank -> key omitted
  assert.equal(plan.draft.entry.rightsBasis, "own");
  assert.equal(plan.draft.entry.credit, "J. Smith");
});

// ---- payload types ----

for (const [label, value] of [
  ["a number", 5],
  ["an object", { a: 1 }],
  ["an array", [1]],
  ["a boolean", true],
]) {
  test(`an optional field that is ${label} skips the row (bad_payload), never emits null`, () => {
    for (const field of PAYLOAD_FIELDS.filter((f) => f !== "rightsBasis")) {
      const result = exportRow(rowOf({}, { rightsBasis: "owner", [field]: value }));
      assert.deepEqual(result.skipped, ["bad_payload"], field);
    }
    const plan = planEntry(rowOf({}, { rightsBasis: value }), ctx);
    assert.deepEqual(plan.reasons, ["bad_payload"]);
  });
}

test("a JSON null in an optional field leaves the key out; in rightsBasis it skips the row", () => {
  const all = Object.fromEntries(PAYLOAD_FIELDS.filter((f) => f !== "rightsBasis").map((f) => [f, null]));
  const result = exportRow(rowOf({}, { rightsBasis: "owner", ...all }));
  assert.deepEqual(Object.keys(result.entry), ["sourceId", "owner", "status", "file", "contentType", "sha256", "rightsBasis", "submittedAt"]);
  assert.deepEqual(planEntry(rowOf({}, { rightsBasis: null }), ctx).reasons, ["bad_payload"]);
});

test("a missing, SQL-NULL or blank optional field gives no key at all", () => {
  const blank = exportRow(rowOf({}, { rightsBasis: "authorized", credit: "   ", description: "\n\t", title: "" }));
  assert.equal(blank.entry.rightsBasis, "authorized");
  for (const key of ["credit", "description", "title", "aircraft", "airline", "rightsEvidence"]) assert.ok(!(key in blank.entry), key);
  assert.ok(!JSON.stringify(blank.entry).includes("null"));
});

test("invalid JSON, a non-object payload and an unmapped rightsBasis skip the row", () => {
  assert.deepEqual(exportRow(rowOf({}, null)).skipped, ["bad_payload"]);
  assert.deepEqual(exportRow(rowOf({ payload_ok: null }, null)).skipped, ["bad_payload"]);
  for (const basis of ["Owner", " owner", "own", "other", "", "toString", "__proto__", undefined]) {
    assert.deepEqual(exportRow(rowOf({}, { rightsBasis: basis })).skipped, ["bad_payload"], String(basis));
  }
});

test("the real SQL gives skips or no key for every odd stored payload", () => {
  const db = d1Sqlite();
  const stored = [
    ["ok", JSON.stringify({ rightsBasis: "owner" })],
    ["null-credit", JSON.stringify({ rightsBasis: "owner", credit: null })],
    ["null-basis", JSON.stringify({ rightsBasis: null })],
    ["number-title", JSON.stringify({ rightsBasis: "owner", title: 7 })],
    ["object-desc", JSON.stringify({ rightsBasis: "owner", description: { x: 1 } })],
    ["not-json", "{oops"],
    ["array", "[1,2]"],
    ["scalar", "42"],
    ["string", '"owner"'],
    ["empty", ""],
  ];
  const insert = db.sqlite.prepare(
    "INSERT INTO submissions (id,owner_id,request_key,payload,image_key,image_mime,image_bytes,width,height,digest,status,review_note,checks,version,last_mutation,created_at,updated_at) VALUES (?,?,?,?,?,'image/jpeg',10,100,100,?,'pending','','{}',1,'m','2026-11-01T10:00:00.000Z','2026-11-01T10:00:00.000Z')",
  );
  for (const [id, payload] of stored) insert.run(id, OWNER, id, payload, `submissions/${id}/${UUID}`, DIGEST);
  const outcome = Object.fromEntries(db.sqlite.prepare(EXPORT_SQL).all().map((r) => [r.id, exportRow(r)]));
  assert.ok(outcome.ok.entry);
  assert.ok(outcome["null-credit"].entry && !("credit" in outcome["null-credit"].entry));
  for (const id of ["null-basis", "number-title", "object-desc", "not-json", "array", "scalar", "string", "empty"]) {
    assert.deepEqual(outcome[id].skipped, ["bad_payload"], id);
  }
});

// ---- skip reasons ----

test("demo rows are skipped by id or by digest, including a demo row revised with a real photo", async () => {
  assert.deepEqual(planEntry(rowOf({ id: "demo-submission-atc" }), ctx).reasons, ["demo"]);
  assert.deepEqual(planEntry(rowOf({ digest: "demo:aircraft" }), ctx).reasons, ["demo"]);

  const db = d1Sqlite();
  const photos = memoryPhotos();
  await loadDemoData(db, OWNER);
  const demo = db.sqlite.prepare("SELECT * FROM submissions WHERE id='demo-submission-aircraft'").get();
  await writeSubmission(db, () => photos, {
    owner: OWNER,
    key: "retry-key-0000000002",
    old: { ...demo },
    payload: JSON.stringify(submissionData()),
    image: { bytes: JPEG, mime: "image/jpeg", width: 1200, height: 800, digest: DIGEST },
  });
  const revised = db.sqlite.prepare(EXPORT_SQL).all().find((r) => r.id === "demo-submission-aircraft");
  assert.equal(revised.digest, DIGEST, "the revision replaced the demo digest with a real one");
  assert.deepEqual(planEntry(revised, ctx).reasons, ["demo"]);
  assert.deepEqual(db.sqlite.prepare(EXPORT_SQL).all().map((r) => planEntry(r, ctx).ok), [false, false]);
});

test("rejected and unknown statuses are skipped; the three kept statuses are exported", () => {
  assert.deepEqual(planEntry(rowOf({ status: "rejected" }), ctx).reasons, ["rejected"]);
  for (const status of ["published", "", null, 3]) assert.deepEqual(planEntry(rowOf({ status }), ctx).reasons, ["bad_status"]);
  assert.deepEqual(planEntry(rowOf({ version: "2" }), ctx).reasons, ["bad_status"]);
  for (const status of ["pending", "changes_requested", "approved"]) assert.equal(exportRow(rowOf({ status })).entry.status, status);
});

test("ids must be plain and the image key must be the one this row would have", () => {
  assert.deepEqual(planEntry(rowOf({ id: "bad id!" }), ctx).reasons.slice(0, 1), ["bad_id"]);
  assert.deepEqual(planEntry(rowOf({ id: "a".repeat(81) }), ctx).reasons.slice(0, 1), ["bad_id"]);
  assert.equal(exportRow(rowOf({ id: "A".repeat(80), image_key: `submissions/${"A".repeat(80)}/${UUID}` })).entry.sourceId.length, 80);
  for (const image_key of [`submissions/other/${UUID}`, "submissions/abc-1/../x", `submissions/abc-1/${UUID}x`, "x", null, `/submissions/abc-1/${UUID}`]) {
    assert.deepEqual(planEntry(rowOf({ image_key }), ctx).reasons, ["bad_image_ref"], String(image_key));
  }
  for (const digest of ["", "ABC", "0".repeat(63), DIGEST.toUpperCase(), null]) {
    assert.deepEqual(planEntry(rowOf({ digest }), ctx).reasons, ["bad_image_ref"], String(digest));
  }
  assert.deepEqual(planEntry(rowOf({ width: null }), ctx).reasons, ["bad_image_ref"]);
});

test("owner: the backend principal rule, the 512 limit and a project mismatch", () => {
  assert.equal(ownerCheck(OWNER, PROJECT), "ok");
  assert.equal(ownerCheck("firebase:other-project:uid1", PROJECT), "owner_project_mismatch");
  for (const bad of ["", "uid1", `firebase:${PROJECT}:`, `firebase:${PROJECT}:a:b`, `firebase:${PROJECT}:a/b`, `firebase:${PROJECT}: a`, `firebase:${PROJECT}:a\n`, `firebase:${PROJECT}:${"u".repeat(129)}`, "firebase:other:", null, 5]) {
    assert.equal(ownerCheck(bad, PROJECT), "bad_owner", String(bad));
  }
  const longProject = "p".repeat(512 - "firebase::".length - 128 + 1);
  const atLimit = `firebase:${longProject}:${"u".repeat(128)}`;
  assert.equal(atLimit.length, 513);
  assert.equal(ownerCheck(atLimit, longProject), "bad_owner");
  assert.equal(ownerCheck(atLimit.slice(0, 512).replace(/u$/, "u"), longProject), "ok");
  assert.equal(uidOfAccountPrincipal(`firebase:${PROJECT}:abc`, PROJECT), "abc");
  assert.equal(uidOfAccountPrincipal({}, PROJECT), undefined);
  assert.deepEqual(planEntry(rowOf({ owner_id: "firebase:x:y" }), ctx).reasons, ["owner_project_mismatch"]);
});

test("submittedAt is created_at verbatim and must be a real past UTC time", () => {
  assert.equal(exportRow(rowOf({ created_at: "2026-11-01T10:00:00Z" })).entry.submittedAt, "2026-11-01T10:00:00Z");
  assert.equal(exportRow(rowOf({ created_at: "2026-11-01T10:00:00.123Z" })).entry.submittedAt, "2026-11-01T10:00:00.123Z");
  for (const created_at of ["2026-11-01 10:00:00", "2026-02-30T10:00:00.000Z", "2026-11-05T10:00:00.000Z", "2026-11-01T10:00:00.1234Z", "2026-11-01T10:00:00+01:00", "", null, 5]) {
    assert.deepEqual(planEntry(rowOf({ created_at }), ctx).reasons, ["bad_submitted_at"], String(created_at));
  }
});

test("over-limit images are listed as needs_reupload before any download", () => {
  assert.equal(planEntry(rowOf({ image_bytes: MAX_IMAGE_BYTES }), ctx).ok, true);
  assert.deepEqual(planEntry(rowOf({ image_bytes: MAX_IMAGE_BYTES + 1 }), ctx).reasons, ["needs_reupload"]);
  assert.deepEqual(planEntry(rowOf({ width: 4097 }), ctx).reasons, ["needs_reupload"]);
  assert.deepEqual(planEntry(rowOf({ height: 4097 }), ctx).reasons, ["needs_reupload"]);
  assert.equal(planEntry(rowOf({ width: 4096, height: 4096 }), ctx).ok, true);
  // every applicable reason is listed, the first is the counted one
  assert.deepEqual(planEntry(rowOf({ width: 5000, owner_id: "nope" }), ctx).reasons, ["bad_owner", "needs_reupload"]);
});

// ---- the downloaded photo ----

test("checkImage and finishEntry: type by magic bytes, size caps, digest read back", () => {
  assert.equal(sniffType(JPEG), "image/jpeg");
  assert.equal(sniffType(PNG), "image/png");
  assert.equal(sniffType(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);
  assert.equal(sniffType(new Uint8Array([1, 2, 3])), null);
  assert.equal(sniffType(new Uint8Array(0)), null);

  const draft = planEntry(rowOf(), ctx).draft;
  assert.deepEqual(checkImage(draft, null), { ok: false, reason: "missing_image" });
  assert.deepEqual(checkImage(draft, new Uint8Array(0)), { ok: false, reason: "empty_image" });
  assert.deepEqual(checkImage(draft, new Uint8Array([1, 2, 3, 4])), { ok: false, reason: "unsupported_type" });
  const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
  big.set(JPEG);
  assert.deepEqual(checkImage(draft, big), { ok: false, reason: "needs_reupload" });

  const ok = checkImage(draft, JPEG);
  assert.equal(ok.file, "abc-1.jpg");
  assert.deepEqual(ok.warnings, []);
  assert.deepEqual(finishEntry(draft, ok, "0".repeat(64)), { ok: false, reason: "digest_mismatch" });
  const done = finishEntry(draft, ok, DIGEST);
  assert.equal(done.entry.contentType, "image/jpeg");

  const png = exportRow(rowOf({ image_mime: "image/jpeg", digest: sha256Hex(PNG) }), PNG);
  assert.equal(png.entry.file, "abc-1.png");
  assert.equal(png.entry.contentType, "image/png");
  assert.deepEqual(png.warnings, ["content_type_differs"]);
});

test("entry keys come only from ENTRY_KEYS and carry no personal data", () => {
  const all = Object.fromEntries(PAYLOAD_FIELDS.map((f) => [f, f === "rightsBasis" ? "owner" : `value of ${f}`]));
  const result = exportRow(rowOf({}, { ...all, email: "secret@example.com", photographer: "Secret Name" }));
  assert.deepEqual(Object.keys(result.entry), [...ENTRY_KEYS]);
  assert.ok(!JSON.stringify(result.entry).includes("secret@example.com"));
  assert.ok(!JSON.stringify(result.entry).includes("Secret Name"));
});

// ---- the rule that matters most: no manifest the backend refuses as a whole ----

test("extreme rows the backend still accepts build a manifest that parses under the copied schema", () => {
  const longProject = "p".repeat(512 - "firebase::".length - 128);
  const longOwner = `firebase:${longProject}:${"u".repeat(128)}`;
  assert.equal(longOwner.length, 512);
  const text = "é\u{1f6e9}😀\u0000\n\t\"\\ ".repeat(2000);
  const rows = [
    rowOf({ id: "z".repeat(80), image_key: `submissions/${"z".repeat(80)}/${UUID}`, owner_id: longOwner }, { rightsBasis: "authorized", description: text, rightsEvidence: text, factualSource: text, title: text, credit: text }),
    rowOf({ id: "b", image_key: `submissions/b/${UUID}`, created_at: "2026-11-01T10:00:00Z" }, { rightsBasis: "owner", aircraft: "  padded  ", registration: "\n" + "x" }),
    rowOf({ id: "c", image_key: `submissions/c/${UUID}`, image_bytes: MAX_IMAGE_BYTES, width: 4096, height: 4096 }),
  ];
  const entries = rows.map((r) => {
    const result = exportRow(r, JPEG, { project: r.owner_id.split(":")[1], now: NOW });
    assert.ok(result.entry, JSON.stringify(result.skipped));
    return result.entry;
  });
  const built = buildManifest(entries);
  const parsed = parseManifest(built.text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.manifest.entries.length, 3);
  assert.equal(built.manifest.entries[0].description, text);
  assert.equal(built.bytes, new TextEncoder().encode(built.text).length);
});

test("many generated rows, odd payloads and odd columns included, always build an accepted manifest", () => {
  let seed = 12345;
  const rand = (n) => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return (seed >>> 8) % n;
  };
  const pick = (list) => list[rand(list.length)];
  const strings = ["", " ", "x", "  padded ", "line\nbreak", "tab\t", "\u0000nul", "emoji \u{1f6e9}", "lone \ud800", "q\"uote\\", "a".repeat(5000), "firebase:demo-airplane-games:u", "</script>"];
  const odd = [null, 7, 3.5, true, [], ["a"], { a: "b" }];
  const statuses = ["pending", "changes_requested", "approved", "rejected", "weird", null];
  const bases = ["owner", "authorized", "own", "OWNER", "", 1, null];
  const owners = [OWNER, "firebase:demo-airplane-games:u:v", "firebase:elsewhere:u", `firebase:${PROJECT}:${"u".repeat(rand(140))}`, "", null, 5];
  const dates = ["2026-11-01T10:00:00.000Z", "2026-11-01T10:00:00Z", "2031-01-01T00:00:00.000Z", "garbage", null, "2026-13-01T10:00:00.000Z"];
  let accepted = 0;
  let skipped = 0;
  const tally = {};
  const entries = [];
  for (let n = 0; n < 600; n++) {
    const clean = rand(3) > 0; // most rows have sound columns; the rest are garbage in every column
    const id = clean ? pick(["r" + n, "R" + n, "x".repeat(rand(70) + 1) + n]) : pick(["bad id " + n, "x".repeat(100) + n, "r" + n]);
    const payload = rand(40) === 0 ? null : { rightsBasis: clean && rand(8) ? pick(bases.slice(0, 2)) : pick(bases) };
    for (const f of PAYLOAD_FIELDS) {
      if (f === "rightsBasis" || !payload || rand(2)) continue;
      payload[f] = clean && rand(12) ? pick(strings) : pick([...strings, ...odd]);
    }
    const row = rowOf(
      clean
        ? { id, image_key: `submissions/${id}/${UUID}`, version: rand(5), image_bytes: pick([0, 1000, MAX_IMAGE_BYTES]), width: pick([1, 4096]), status: pick(statuses.slice(0, 4)) }
        : {
            id,
            owner_id: pick(owners),
            status: pick(statuses),
            version: rand(9) === 0 ? "1" : rand(5),
            image_key: rand(8) === 0 ? "nope" : `submissions/${id}/${UUID}`,
            image_bytes: pick([0, 1000, MAX_IMAGE_BYTES, MAX_IMAGE_BYTES + 1, null]),
            width: pick([1, 4096, 4097, null]),
            created_at: pick(dates),
            digest: rand(10) === 0 ? "demo:aircraft" : DIGEST,
          },
      payload,
    );
    const result = exportRow(row);
    if (result.entry) {
      accepted++;
      entries.push(result.entry);
    } else { skipped++; for (const r of result.skipped) tally[r] = (tally[r] || 0) + 1; }
  }
  assert.ok(accepted > 20 && skipped > 100, `accepted ${accepted}, skipped ${skipped} ${JSON.stringify(tally)}`);
  const built = buildManifest(entries);
  const reparsed = parseManifest(built.text);
  assert.equal(reparsed.ok, true);
  assert.equal(reparsed.manifest.entries.length, accepted);
  for (const e of reparsed.manifest.entries) for (const v of Object.values(e)) assert.equal(typeof v, "string");
});

test("buildManifest throws, rather than emit, a manifest the backend would refuse as a whole", () => {
  const good = exportRow(rowOf()).entry;
  assert.doesNotThrow(() => buildManifest([good]));
  assert.doesNotThrow(() => buildManifest([]));
  const refused = (entries) => assert.throws(() => buildManifest(entries), /backend|bytes|file name/);
  refused([good, { ...good }]); // duplicate sourceId
  refused([{ ...good, email: "a@b.c" }]); // unknown key
  refused([{ ...good, credit: null }]); // non-string
  refused([{ ...good, status: "published" }]);
  refused([{ ...good, status: "rejected", rightsBasis: "owner" }].map((e) => ({ ...e, rightsBasis: "other" })));
  refused([{ ...good, sourceId: "" }]);
  refused([{ ...good, sourceId: "x".repeat(129) }]);
  refused([{ ...good, owner: "x".repeat(513) }]);
  refused([{ ...good, file: "f".repeat(256) }]);
  refused([{ ...good, sha256: "" }]);
  refused([{ ...good, submittedAt: "t".repeat(65) }]);
  const { file: _file, ...noFile } = good;
  refused([noFile]);
  refused(Array.from({ length: 5001 }, (_, i) => ({ ...good, sourceId: `s${i}`, file: `s${i}.jpg` })));
  assert.doesNotThrow(() => buildManifest(Array.from({ length: 5000 }, (_, i) => ({ ...good, sourceId: `s${i}`, file: `s${i}.jpg` }))));
  refused([{ ...good, description: "x".repeat(MAX_MANIFEST_BYTES) }]); // over 10 MB in bytes
  // multi-byte text: under 10 MB in characters, over it in bytes
  const chars = Math.ceil(MAX_MANIFEST_BYTES / 3) + 10;
  assert.ok(chars < MAX_MANIFEST_BYTES);
  refused([{ ...good, description: "€".repeat(chars) }]);
  refused([good, { ...good, sourceId: "ABC-1", file: "ABC-1.jpg" }]); // file names equal ignoring case
});

// ---- drift guard and report ----

test("export state records id, version and status only, and compareState finds drift", () => {
  const drafts = [exportRow(rowOf()), exportRow(rowOf({ id: "d2", status: "approved", version: 4, image_key: `submissions/d2/${UUID}` }))].map((r) => r.draft);
  const state = exportState(drafts);
  assert.deepEqual(state, [
    { id: "abc-1", version: 1, status: "pending" },
    { id: "d2", version: 4, status: "approved" },
  ]);
  const same = [{ id: "abc-1", version: 1, status: "pending" }, { id: "d2", version: 4, status: "approved" }, { id: "new", version: 1, status: "pending" }];
  assert.deepEqual(compareState(state, same), { ok: true, malformed: false, differences: [], added: 1 });
  const drifted = compareState(state, [{ id: "abc-1", version: 2, status: "pending" }]);
  assert.equal(drifted.ok, false);
  assert.deepEqual(drifted.differences, [{ id: "abc-1", kind: "changed" }, { id: "d2", kind: "missing" }]);
  assert.equal(compareState(state, [{ id: "abc-1", version: 1, status: "rejected" }, { id: "d2", version: 4, status: "approved" }]).ok, false);
  for (const bad of [null, {}, [{ id: 1 }], [{ id: "a", version: "1", status: "x" }]]) assert.equal(compareState(bad, same).malformed, true);
});

test("summarise counts by first reason, lists ids under every reason, re-uploads first", () => {
  const s = summarise([
    { id: "a", exported: true, owner: "o1", warnings: ["content_type_differs"] },
    { id: "b", exported: true, owner: "o1" },
    { id: "c", exported: true, owner: "o2" },
    { id: "d", exported: false, reasons: ["rejected"] },
    { id: "e", exported: false, reasons: ["bad_owner", "needs_reupload"] },
    { id: "f", exported: false, reasons: ["needs_reupload"] },
    { id: "g", exported: false, reasons: ["digest_mismatch"] },
  ]);
  assert.equal(s.exported, 3);
  assert.equal(s.skipped, 4);
  assert.equal(s.distinctOwners, 2);
  assert.deepEqual(s.warnings, { content_type_differs: 1 });
  assert.deepEqual(s.counts, [
    { reason: "needs_reupload", count: 1 },
    { reason: "rejected", count: 1 },
    { reason: "bad_owner", count: 1 },
    { reason: "digest_mismatch", count: 1 },
  ]);
  assert.equal(s.lists[0].reason, "needs_reupload");
  assert.deepEqual(s.lists[0].ids, ["e", "f"]);
  assert.ok(!JSON.stringify(s).includes("o1"));
});
