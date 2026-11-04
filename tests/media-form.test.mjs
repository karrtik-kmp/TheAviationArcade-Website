import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MEDIA_MAX_BYTES,
  RIGHTS_STATEMENT,
  createUploadKeys,
  licenceDiff,
  licenceErrors,
  mediaOutcome,
  mintKey,
  descriptionErrors,
  needsRightsStatement,
  precheckImage,
  rebaseLicence,
  publishBlockers,
  sniffImageType,
} from "../lib/media-form.ts";

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const blobOf = (head, size, type = "") => {
  const bytes = new Uint8Array(size);
  bytes.set(head.slice(0, size));
  return new Blob([bytes], { type });
};
const licence = (over = {}) => ({
  credit: null,
  licenceName: null,
  licenceUrl: null,
  sourceUrl: null,
  attributionText: null,
  creditRequired: false,
  ...over,
});
const blank = { credit: "", licenceName: "", licenceUrl: "", sourceUrl: "", attributionText: "" };

test("size boundary: 5,242,880 bytes is accepted, one more is refused", async () => {
  assert.equal(MEDIA_MAX_BYTES, 5242880);
  assert.deepEqual(await precheckImage(blobOf(JPEG, 5242880)), { ok: true, contentType: "image/jpeg" });
  const over = await precheckImage(blobOf(JPEG, 5242881));
  assert.equal(over.ok, false);
  assert.equal(over.reason, "tooLarge");
  assert.ok(over.message);
  assert.equal((await precheckImage(blobOf([], 0))).reason, "empty");
});

test("the type comes from the magic bytes even when file.type is empty or lying", async () => {
  assert.equal((await precheckImage(blobOf(JPEG, 100, ""))).contentType, "image/jpeg");
  assert.equal((await precheckImage(blobOf(PNG, 100, ""))).contentType, "image/png");
  assert.equal((await precheckImage(blobOf(PNG, 100, "image/jpeg"))).contentType, "image/png");
  const gif = await precheckImage(blobOf([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 100, "image/jpeg"));
  assert.deepEqual([gif.ok, gif.reason], [false, "unsupportedType"]);
  assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8])), null, "too short");
  assert.equal(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null, "PNG needs the whole signature");
});

test("sides are checked only where createImageBitmap exists", async () => {
  const original = globalThis.createImageBitmap;
  try {
    globalThis.createImageBitmap = async () => ({ width: 4097, height: 10, close() {} });
    assert.equal((await precheckImage(blobOf(PNG, 100))).reason, "tooWide");
    globalThis.createImageBitmap = async () => ({ width: 4096, height: 4096, close() {} });
    assert.deepEqual(await precheckImage(blobOf(PNG, 100)), { ok: true, contentType: "image/png", width: 4096, height: 4096 });
    globalThis.createImageBitmap = async () => {
      throw new Error("cannot decode");
    };
    assert.equal((await precheckImage(blobOf(PNG, 100))).ok, true, "the backend still checks what the browser cannot read");
  } finally {
    if (original) globalThis.createImageBitmap = original;
    else delete globalThis.createImageBitmap;
  }
});

test("licence validation: trimmed, one line, http(s) links, limits", () => {
  assert.deepEqual(licenceErrors(blank), {});
  assert.deepEqual(licenceErrors({ ...blank, credit: "  A. Pilot  ", licenceName: "CC BY 4.0" }), {});
  assert.ok(licenceErrors({ ...blank, credit: "two\nlines" }).credit, "newline refused");
  assert.ok(licenceErrors({ ...blank, attributionText: "a\r\nb" }).attributionText);
  assert.ok(licenceErrors({ ...blank, licenceName: "bell\u0007" }).licenceName, "control character refused");
  assert.ok(licenceErrors({ ...blank, licenceName: "x".repeat(201) }).licenceName);
  assert.deepEqual(licenceErrors({ ...blank, licenceName: "x".repeat(200) }), {});
  assert.ok(licenceErrors({ ...blank, attributionText: "x".repeat(1001) }).attributionText);
  assert.deepEqual(licenceErrors({ ...blank, attributionText: "x".repeat(1000) }), {});
  assert.deepEqual(licenceErrors({ ...blank, licenceUrl: "https://example.com/l", sourceUrl: " http://example.com " }), {});
  for (const bad of ["example.com", "ftp://example.com", "javascript:alert(1)", "https://", "https://exa mple.com"])
    assert.ok(licenceErrors({ ...blank, licenceUrl: bad }).licenceUrl, bad);
  assert.ok(licenceErrors({ ...blank, sourceUrl: `https://e.com/${"a".repeat(2048)}` }).sourceUrl);
  assert.ok(licenceErrors({ ...blank, credit: "  " }).credit === undefined, "whitespace only is a clear, not an error");
});

test("licence diff: unchanged omitted, cleared is null, nothing changed is none", () => {
  const base = licence({ credit: "A. Pilot", licenceName: "CC BY", creditRequired: true });
  assert.deepEqual(licenceDiff(base, { ...blank, credit: " A. Pilot ", licenceName: "CC BY" }), { none: true });
  assert.deepEqual(licenceDiff(base, { ...blank, credit: "A. Pilot", licenceName: "CC BY", sourceUrl: "https://e.com" }), {
    changes: { sourceUrl: "https://e.com" },
  });
  assert.deepEqual(licenceDiff(base, { ...blank, credit: "", licenceName: "CC BY" }), { changes: { credit: null } });
  assert.deepEqual(licenceDiff(licence(), blank), { none: true }, "empty against null is unchanged");
  assert.deepEqual(licenceDiff(base, { credit: "New" }), { changes: { credit: "New" } }, "absent fields are left alone");
});

test("creditRequired is sent only when staff and changed", () => {
  const base = licence({ creditRequired: false });
  const values = { ...blank, creditRequired: true };
  assert.deepEqual(licenceDiff(base, values), { none: true }, "a photographer never sends it");
  assert.deepEqual(licenceDiff(base, values, false), { none: true });
  assert.deepEqual(licenceDiff(base, values, true), { changes: { creditRequired: true } });
  assert.deepEqual(licenceDiff(base, { ...blank, creditRequired: false }, true), { none: true });
  assert.deepEqual(licenceDiff(base, { ...blank, credit: "x", creditRequired: true }, false), { changes: { credit: "x" } });
});

test("publish blockers come from the saved licence", () => {
  assert.deepEqual(publishBlockers(licence({ licenceName: "CC BY" })), []);
  assert.deepEqual(publishBlockers(licence()).map((b) => b.field), ["licenceName"]);
  assert.deepEqual(publishBlockers(licence({ licenceName: "CC BY", creditRequired: true })).map((b) => b.field), ["credit"]);
  assert.deepEqual(publishBlockers(licence({ creditRequired: true })).map((b) => b.field), ["licenceName", "credit"]);
  assert.deepEqual(publishBlockers(licence({ licenceName: "CC BY", credit: "A", creditRequired: true })), []);
});

test("key lifecycle: stable per (file, target), new after success, key reuse, file or target change", () => {
  let n = 0;
  const keys = createUploadKeys(() => `key-${++n}`);
  const a = new Blob(["a"]);
  const b = new Blob(["b"]);
  const k1 = keys.keyFor(a, "create");
  assert.equal(keys.keyFor(a, "create"), k1, "same file and target: same key");
  for (const outcome of ["retryable", "conflict", "fileRejected", "error", "roleLost", "fenced"]) {
    keys.settle(outcome);
    assert.equal(keys.keyFor(a, "create"), k1, `${outcome} keeps the key`);
  }
  const k2 = keys.keyFor(b, "create");
  assert.notEqual(k2, k1, "another file");
  const k3 = keys.keyFor(b, "version:med-1");
  assert.notEqual(k3, k2, "another target");
  assert.equal(keys.keyFor(b, "version:med-1"), k3);
  keys.settle("ok");
  const k4 = keys.keyFor(b, "version:med-1");
  assert.notEqual(k4, k3, "new key after success");
  keys.settle("keyReused");
  assert.notEqual(keys.keyFor(b, "version:med-1"), k4, "new key after IDEMPOTENCY_KEY_REUSED");
  const real = mintKey();
  assert.match(real, /^[A-Za-z0-9_-]{1,128}$/);
  assert.notEqual(real, mintKey());
});

test("outcome mapping", () => {
  const cases = [
    [201, undefined, "ok"],
    [200, undefined, "ok"],
    [0, undefined, "retryable"],
    [429, "RATE_LIMITED", "retryable"],
    [503, "STORAGE_UNAVAILABLE", "retryable"],
    [503, "BACKEND_UNAVAILABLE", "retryable"],
    [503, "BACKEND_NOT_CONNECTED", "retryable"],
    [503, "ROLES_UNAVAILABLE", "retryable"],
    [409, "VERSION_CONFLICT", "conflict"],
    [409, "NOTHING_TO_PUBLISH", "conflict"],
    [409, "RIGHTS_ALREADY_STATED", "conflict"],
    [413, "TOO_LARGE", "fileRejected"],
    [415, "UNSUPPORTED_TYPE", "fileRejected"],
    [422, "MEDIA_INVALID", "fileRejected"],
    [422, "IDEMPOTENCY_KEY_REUSED", "keyReused"],
    [422, "LICENCE_INCOMPLETE", "error"],
    [403, "PHOTOGRAPHER_REQUIRED", "roleLost"],
    [403, "FORBIDDEN", "roleLost"],
    [401, "SIGNED_OUT", "fenced"],
    [409, "ACCOUNT_CHANGED", "fenced"],
    [502, "BACKEND_CONTRACT", "error"],
    [400, "INVALID_REQUEST", "error"],
    [404, "NOT_FOUND", "error"],
    [403, "DEMO_ACCOUNT", "error"],
  ];
  for (const [status, code, want] of cases) assert.equal(mediaOutcome(status, code), want, `${status} ${code}`);
});

test("the rights statement ids are the backend's v1 statements", () => {
  assert.deepEqual(RIGHTS_STATEMENT.options.map((o) => o.id), ["v1_own", "v1_authorised"]);
  assert.equal(RIGHTS_STATEMENT.question, "Who holds the rights to this photo?");
  assert.ok(RIGHTS_STATEMENT.consent.startsWith("I confirm this is true"));
  assert.equal("auditNote" in RIGHTS_STATEMENT, false);
});

test("the upload key goes with the rights statement", () => {
  const keys = createUploadKeys();
  const file = blobOf(JPEG, 10);
  const k1 = keys.keyFor(file, "create", "v1_own");
  assert.equal(keys.keyFor(file, "create", "v1_own"), k1, "a retry reuses both");
  const k2 = keys.keyFor(file, "create", "v1_authorised");
  assert.notEqual(k2, k1, "changing the statement mints a new key");
});

test("description rules", () => {
  assert.equal(descriptionErrors(""), undefined);
  assert.equal(descriptionErrors("Line one\r\nLine two\nLine three"), undefined);
  assert.match(descriptionErrors("a	b"), /control/, "the only control character allowed is a newline");
  assert.match(descriptionErrors("bell\u0007"), /control/);
  assert.match(descriptionErrors("lone\rcarriage"), /control/);
  assert.equal(descriptionErrors("x".repeat(2000)), undefined);
  assert.match(descriptionErrors("x".repeat(2001)), /2000/);
  assert.equal(descriptionErrors(" ".repeat(3000) + "ok"), undefined, "length counts after trim");
});

test("the diff and rebase carry the description", () => {
  const base = { ...licence({ licenceName: "L" }), description: "Old" };
  assert.deepEqual(licenceDiff(base, { description: "Old\r\n" }), { none: true }, "unchanged is not sent");
  assert.deepEqual(licenceDiff(base, { description: "New\r\nline" }), { changes: { description: "New\nline" } });
  assert.deepEqual(licenceDiff(base, { description: "  " }), { changes: { description: null } }, "cleared");
  assert.deepEqual(licenceDiff(licence(), { description: "" }), { none: true });
  const newBase = { ...base, description: "Theirs" };
  assert.equal(rebaseLicence(base, newBase, { description: "Old" }).description, "Theirs", "untouched follows");
  assert.equal(rebaseLicence(base, newBase, { description: "Mine" }).description, "Mine", "typed stays");
});

test("publish blockers include a missing v1 rights statement", () => {
  const ok = licence({ licenceName: "L" });
  const when = "2026-11-04T10:00:00.000Z";
  assert.deepEqual(publishBlockers(ok), [], "rights not checked when not given");
  assert.deepEqual(publishBlockers(ok, { statement: "v1_own", statedAt: when }), []);
  assert.deepEqual(publishBlockers(ok, { statement: "v1_authorised", statedAt: when }), []);
  assert.deepEqual(publishBlockers(ok, null).map((b) => b.field), ["rights"]);
  assert.deepEqual(publishBlockers(ok, { statement: "d1_private_review", statedAt: when }).map((b) => b.field), ["rights"]);
});

test("rebaseLicence takes new saved values for untouched fields and keeps typed ones", () => {
  const oldBase = licence({ credit: "A", licenceName: "L1", creditRequired: true });
  const newBase = licence({ credit: "B", licenceName: "L2", licenceUrl: "https://x.example/l", creditRequired: false });
  const values = {
    credit: "A", // untouched
    licenceName: "Mine", // typed
    licenceUrl: "",
    sourceUrl: "",
    attributionText: "",
    creditRequired: true,
  };
  const next = rebaseLicence(oldBase, newBase, values);
  assert.equal(next.credit, "B");
  assert.equal(next.licenceName, "Mine");
  assert.equal(next.licenceUrl, "https://x.example/l");
  assert.equal(next.creditRequired, false);
  // Diff against the new base resends only the typed field.
  assert.deepEqual(licenceDiff(newBase, next, true), { changes: { licenceName: "Mine" } });
  const kept = rebaseLicence(oldBase, newBase, { ...values, creditRequired: false });
  assert.equal(kept.creditRequired, false);
  const typedFlag = rebaseLicence(licence({ creditRequired: false }), licence({ creditRequired: false }), { creditRequired: true });
  assert.equal(typedFlag.creditRequired, true);
  // Whitespace alone is not an edit: another editor's saved credit still wins.
  const spaced = rebaseLicence(oldBase, newBase, { ...values, credit: "A " });
  assert.equal(spaced.credit, "B");
});

test("the rights step applies to any never-published draft without a v1 statement", () => {
  const draft = (over = {}) => ({ publishedAt: null, rights: null, ...over });
  const item = (over = {}, d = {}) => ({ draftVersion: 1, publishedVersion: null, draft: draft(d), ...over });
  const when = "2026-11-04T10:00:00.000Z";
  assert.equal(needsRightsStatement(item()), true, "new upload with none");
  assert.equal(needsRightsStatement(item({}, { rights: { statement: "d1_private_review", statedAt: when } })), true, "imported");
  assert.equal(needsRightsStatement(item({}, { rights: { statement: "v1_own", statedAt: when } })), false, "already stated");
  assert.equal(needsRightsStatement(item({ draftVersion: 3, publishedVersion: 2 })), true, "published item with a newer draft and no rights");
  assert.equal(needsRightsStatement(item({ draftVersion: 2, publishedVersion: 2 }, { publishedAt: when })), false, "the live version");
  assert.equal(needsRightsStatement(item({ draftVersion: 2, publishedVersion: null }, { publishedAt: when })), false, "withdrawn, draft was live once");
  assert.equal(needsRightsStatement(item({ draftVersion: 3, publishedVersion: null })), true, "withdrawn item with a newer, never-live draft");
});
