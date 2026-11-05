import assert from "node:assert/strict";
import { test } from "node:test";
import {
  blockStatusOf,
  contentsLabel,
  draftOf,
  emptyDraft,
  outcomeOf,
  parseHints,
  parseMiles,
  requestBody,
  storeProductLabel,
  validateDraft,
  waitText,
} from "../lib/store-form.ts";

const pack = {
  productId: "hint_pack_5",
  kind: "hint_pack",
  hints: 5,
  miles: null,
  passPeriod: null,
  title: "Five hints",
  demo: true,
  status: "active",
  version: 3,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-02T00:00:00.000Z",
};
const milesPack = { ...pack, productId: "miles_pack_5000", kind: "miles_pack", hints: null, miles: 5000, title: "Miles", demo: false };
const pass = { ...pack, productId: "first_class_pass_monthly", kind: "first_class_pass", hints: null, passPeriod: "P1M", title: "Monthly pass", demo: false };

test("labels", () => {
  assert.equal(storeProductLabel("hint_pack"), "Hint pack");
  assert.equal(storeProductLabel("first_class_pass"), "First Class Pass");
  assert.equal(storeProductLabel("miles_pack"), "Miles pack");
  assert.equal(contentsLabel(milesPack), "5,000 Miles");
  assert.equal(contentsLabel({ ...milesPack, miles: 1000000 }), "1,000,000 Miles");
  assert.equal(contentsLabel({ kind: "miles_pack", miles: null }), "—");
  assert.equal(contentsLabel(pack), "5 hints");
  assert.equal(contentsLabel({ ...pack, hints: 1 }), "1 hint");
  assert.equal(contentsLabel(pass), "Monthly term");
  assert.equal(contentsLabel({ ...pass, passPeriod: "P1Y" }), "Yearly term");
  assert.equal(contentsLabel({ kind: "hint_pack" }), "—");
  assert.equal(contentsLabel({ kind: "first_class_pass", passPeriod: null }), "—");
});

test("parseHints accepts whole numbers only", () => {
  assert.equal(parseHints(" 12 "), 12);
  for (const bad of ["", "1.5", "-1", "+1", "1e3", "abc", "1 2", "1234567"]) assert.equal(parseHints(bad), null, bad);
});

test("parseMiles accepts whole numbers up to seven digits, plain or with thousands commas", () => {
  assert.equal(parseMiles(" 5000 "), 5000);
  assert.equal(parseMiles("1000000"), 1000000);
  assert.equal(parseMiles("5,000"), 5000, "as the desk shows it");
  assert.equal(parseMiles("25,000"), 25000);
  assert.equal(parseMiles("1,000,000"), 1000000);
  for (const bad of ["", "1.5", "-1", "+1", "1e3", "50,00", ",500", "5,000,", "1,0000", "1 2", "12345678"])
    assert.equal(parseMiles(bad), null, bad);
  assert.equal(parseMiles("10,000,000"), 10000000, "well formed; the range check in validateDraft refuses it");
});

test("miles pack: validation, create body and edit body", () => {
  const draft = { ...emptyDraft(), productId: "miles_pack_5000", kind: "miles_pack", title: " Miles ", miles: " 5000 ", hints: "9" };
  assert.deepEqual(validateDraft(draft, "create"), {});
  assert.equal(validateDraft({ ...draft, hints: "" }, "create").hints, undefined, "hints box is ignored");
  for (const bad of ["", "0", "1000001", "1,000,001", "10,000,000", "2.5", "-3", "50,00"]) assert.ok(validateDraft({ ...draft, miles: bad }, "create").miles, bad);
  assert.deepEqual(validateDraft({ ...draft, miles: "5,000" }, "create"), {});
  assert.equal(validateDraft({ ...draft, miles: "0" }, "create").miles, "Enter a whole number of Miles from 1 to 1,000,000.");
  assert.deepEqual(validateDraft({ ...draft, miles: "1" }, "create"), {});
  assert.deepEqual(validateDraft({ ...draft, miles: "1000000" }, "create"), {});
  const out = requestBody(draft);
  assert.deepEqual(out, { body: { kind: "miles_pack", title: "Miles", miles: 5000, demo: false } });
  assert.ok(!("hints" in out.body) && !("passPeriod" in out.body));
  assert.equal(draftOf(milesPack).miles, "5000");
  assert.equal(draftOf(pack).miles, "");
  assert.deepEqual(requestBody(draftOf(milesPack), milesPack), { none: true });
  assert.deepEqual(requestBody({ ...draftOf(milesPack), miles: "6000" }, milesPack), {
    body: { version: 3, kind: "miles_pack", title: "Miles", miles: 6000, demo: false },
  });
});

test("create validation: id, title, hints", () => {
  const ok = { ...emptyDraft(), productId: "hint_pack_10", title: "Ten hints", hints: "10" };
  assert.deepEqual(validateDraft(ok, "create"), {});
  assert.ok(validateDraft({ ...ok, productId: "" }, "create").productId);
  for (const bad of ["Hint", "_x", ".x", "a b", "a-b", "x".repeat(101)])
    assert.ok(validateDraft({ ...ok, productId: bad }, "create").productId, bad);
  assert.deepEqual(validateDraft({ ...ok, productId: "a".repeat(100) }, "create"), {});
  assert.ok(validateDraft({ ...ok, title: "   " }, "create").title);
  assert.ok(validateDraft({ ...ok, title: "a\nb" }, "create").title);
  assert.ok(validateDraft({ ...ok, title: "a\tb" }, "create").title);
  assert.ok(validateDraft({ ...ok, title: "x".repeat(101) }, "create").title);
  assert.deepEqual(validateDraft({ ...ok, title: "x".repeat(100) }, "create"), {});
  // Length is counted after trimming, as the body is sent.
  assert.deepEqual(validateDraft({ ...ok, title: ` ${"x".repeat(100)} ` }, "create"), {});
  // Code points, not UTF-16 units: 100 emoji fit, 101 do not; C1 controls (U+0085) and DEL are refused.
  assert.deepEqual(validateDraft({ ...ok, title: "\u{1F6E9}".repeat(100) }, "create"), {});
  assert.ok(validateDraft({ ...ok, title: "\u{1F6E9}".repeat(101) }, "create").title);
  assert.ok(validateDraft({ ...ok, title: "a\u0085b" }, "create").title);
  assert.ok(validateDraft({ ...ok, title: "a\u007fb" }, "create").title);
  assert.ok(validateDraft({ ...ok, title: "a\u009fb" }, "create").title);
  assert.deepEqual(validateDraft({ ...ok, title: "café  x" }, "create"), {});
  for (const bad of ["", "0", "1001", "2.5", "-3"]) assert.ok(validateDraft({ ...ok, hints: bad }, "create").hints, bad);
  assert.deepEqual(validateDraft({ ...ok, hints: "1" }, "create"), {});
  assert.deepEqual(validateDraft({ ...ok, hints: "1000" }, "create"), {});
});

test("pass needs a term and ignores the hints box", () => {
  const draft = { ...emptyDraft(), productId: "pass_year", kind: "first_class_pass", title: "Yearly", hints: "" };
  assert.ok(validateDraft(draft, "create").passPeriod);
  assert.equal(validateDraft(draft, "create").hints, undefined);
  assert.deepEqual(validateDraft({ ...draft, passPeriod: "P1Y" }, "create"), {});
});

test("edit does not check the id; an untouched title is flagged only for control characters", () => {
  const spaced = { ...pack, title: "  spaced title  " };
  assert.deepEqual(validateDraft({ ...draftOf(spaced), hints: "6" }, "edit", spaced), {}, "stray spaces never block an edit");
  const legacy = { ...pack, title: "odd\ttitle" };
  const draft = { ...draftOf(legacy), hints: "6" };
  assert.match(validateDraft(draft, "edit", legacy).title, /Retype it on one line/, "the server would refuse it, so say so here");
  const legacyC1 = { ...pack, title: "odd\u0085title" };
  assert.match(validateDraft({ ...draftOf(legacyC1), hints: "6" }, "edit", legacyC1).title, /Retype it/, "C1 controls count too");
  assert.deepEqual(validateDraft({ ...draft, title: "odd title" }, "edit", legacy), {});
  assert.ok(validateDraft({ ...draft, title: "odd\ttitle!" }, "edit", legacy).title);
  assert.deepEqual(validateDraft({ ...draftOf(pack), productId: "" }, "edit", pack), {});
});

test("create body: no version, demo false, only the kind's field", () => {
  const hintsDraft = { ...emptyDraft(), productId: "hint_pack_10", title: "  Ten hints ", hints: " 10 " };
  assert.deepEqual(requestBody(hintsDraft), { body: { kind: "hint_pack", title: "Ten hints", hints: 10, demo: false } });
  const passDraft = { ...emptyDraft(), productId: "p", kind: "first_class_pass", title: "Yearly", passPeriod: "P1Y", hints: "9" };
  const out = requestBody(passDraft);
  assert.deepEqual(out, { body: { kind: "first_class_pass", title: "Yearly", passPeriod: "P1Y", demo: false } });
  assert.ok(!("hints" in out.body));
  assert.ok(!("version" in out.body));
});

test("edit body: stored version, kind and demo; changed title trimmed", () => {
  const draft = { ...draftOf(pack), title: "  Six hints  ", hints: "6" };
  assert.deepEqual(requestBody(draft, pack), {
    body: { version: 3, kind: "hint_pack", title: "Six hints", hints: 6, demo: true },
  });
  assert.deepEqual(requestBody({ ...draftOf(pass), passPeriod: "P1Y" }, pass), {
    body: { version: 3, kind: "first_class_pass", title: "Monthly pass", passPeriod: "P1Y", demo: false },
  });
});

test("edit with no changes sends nothing; an unchanged title is sent as stored", () => {
  assert.deepEqual(requestBody(draftOf(pack), pack), { none: true });
  assert.deepEqual(requestBody(draftOf(pass), pass), { none: true });
  // Whitespace-only edit that trims back to the stored title is a change only if the stored one differs.
  assert.deepEqual(requestBody({ ...draftOf(pack), title: " Five hints " }, pack), { none: true });
  const legacy = { ...pack, title: " padded " };
  const out = requestBody({ ...draftOf(legacy), hints: "7" }, legacy);
  assert.equal(out.body.title, " padded ");
  assert.equal(out.body.hints, 7);
});

test("outcomeOf", () => {
  assert.equal(outcomeOf(200, ""), "saved");
  assert.equal(outcomeOf(201, ""), "saved");
  // 409 with a version sent is a conflict, without one the id exists: both reload, never resend.
  assert.equal(outcomeOf(409, "VERSION_CONFLICT"), "reload");
  assert.equal(outcomeOf(409, "PRODUCT_EXISTS"), "reload");
  assert.equal(outcomeOf(409, ""), "reload");
  assert.equal(outcomeOf(404, "NOT_FOUND"), "reload");
  assert.equal(outcomeOf(404, "STORE_UNAVAILABLE"), "error");
  assert.equal(outcomeOf(422, "CONTENT_INVALID"), "fix");
  assert.equal(outcomeOf(422, ""), "fix");
  assert.equal(outcomeOf(400, "INVALID_REQUEST"), "fix");
  for (const [status, code] of [[0, ""], [403, "FORBIDDEN"], [413, "TOO_LARGE"], [429, "RATE_LIMITED"], [502, "BACKEND_CONTRACT"], [503, "BACKEND_UNAVAILABLE"]])
    assert.equal(outcomeOf(status, code), "error", `${status} ${code}`);
});

test("blockStatusOf: only an account mismatch is fenced", () => {
  assert.equal(blockStatusOf(401, ""), 401);
  assert.equal(blockStatusOf(200, "SIGNED_OUT"), 401);
  assert.equal(blockStatusOf(409, "ACCOUNT_CHANGED"), 409);
  assert.equal(blockStatusOf(403, "DEMO_ACCOUNT"), 403);
  assert.equal(blockStatusOf(403, "FORBIDDEN"), null);
  assert.equal(blockStatusOf(409, "VERSION_CONFLICT"), null);
  assert.equal(blockStatusOf(503, "BACKEND_UNAVAILABLE"), null);
});

test("waitText", () => {
  assert.match(waitText("12"), /12 seconds/);
  assert.match(waitText("1"), /a second/);
  assert.match(waitText("300"), /5 minutes/);
  assert.match(waitText(null), /Wait a moment/);
  assert.match(waitText("Wed, 21 Oct 2026"), /Wait a moment/);
});
