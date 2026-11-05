import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptyFilters,
  environmentBadge,
  filtersEmpty,
  filtersToBody,
  grantLabel,
  grantTextMax,
  kindLabel,
  readFailureText,
  referenceLines,
  referencesLabel,
  storeNameLabel,
  subscriptionReference,
  subscriptionStateLabel,
  subscriptionStatusLabel,
  viewPassPrincipal,
  whenLabel,
} from "../lib/store-view.ts";

test("grant label: hints, pass, unknown as truncated JSON", () => {
  assert.equal(grantLabel({ type: "hints", hints: 5 }), "5 hints");
  assert.equal(grantLabel({ type: "hints", hints: 1 }), "1 hint");
  assert.match(grantLabel({ type: "first_class_pass", until: "2026-12-01T00:00:00.000Z" }), /^Pass until .*2026|^Pass until /);
  assert.equal(grantLabel({ type: "miles", miles: 5000 }), "5,000 Miles");
  assert.equal(grantLabel({ type: "miles", miles: 1 }), "1 Miles");
  assert.equal(grantLabel({ type: "stickers", count: 3 }), 'stickers: {"type":"stickers","count":3}');
  const long = grantLabel({ type: "stickers", note: "x".repeat(500) });
  assert.ok(long.endsWith("…"));
  assert.ok(long.length <= "stickers: ".length + grantTextMax + 1);
  assert.equal(grantLabel({ type: "miles" }), 'miles: {"type":"miles"}');
  // A known type missing its field is shown raw instead of throwing.
  assert.equal(grantLabel({ type: "hints" }), 'hints: {"type":"hints"}');
});

test("kind, store and environment labels", () => {
  assert.equal(kindLabel("hint_pack"), "Hint pack");
  assert.equal(kindLabel("first_class_pass"), "First Class Pass");
  assert.equal(kindLabel("miles_pack"), "Miles pack");
  assert.equal(kindLabel("stickers_pack"), "stickers_pack");
  assert.equal(storeNameLabel("apple"), "Apple");
  assert.equal(storeNameLabel("google"), "Google");
  assert.equal(environmentBadge("production"), null);
  assert.equal(environmentBadge("sandbox"), "Sandbox");
  assert.equal(environmentBadge("fake"), "Fake");
});

test("references label: Apple ids, Google order and token fingerprints", () => {
  const none = { transactionId: null, originalTransactionId: null, orderId: null, tokenFingerprint: null, originalFingerprint: null };
  assert.deepEqual(referenceLines(none), ["—"]);
  assert.deepEqual(referenceLines({ ...none, transactionId: "100", originalTransactionId: "90" }), ["Transaction 100", "Original 90"]);
  assert.deepEqual(referenceLines({ ...none, orderId: "GPA.1", tokenFingerprint: "abc123def456" }), [
    "Order GPA.1",
    "Token fingerprint abc123def456…",
  ]);
  assert.deepEqual(referenceLines({ ...none, orderId: "GPA.2", originalFingerprint: "0123456789ab" }), [
    "Order GPA.2",
    "Original token fingerprint 0123456789ab…",
  ]);
  assert.equal(referencesLabel({ ...none, transactionId: "1", orderId: "o" }), "Transaction 1; Order o");
});

test("subscription labels", () => {
  const known = { active: "Active", grace: "Grace period", billing_retry: "Billing retry", on_hold: "On hold", expired: "Expired", revoked: "Revoked" };
  for (const [status, label] of Object.entries(known)) assert.equal(subscriptionStatusLabel(status), label);
  assert.equal(subscriptionStatusLabel("paused"), "paused");
  assert.equal(subscriptionReference({ originalTransactionId: "77", originalFingerprint: null }), "77");
  assert.equal(subscriptionReference({ originalTransactionId: null, originalFingerprint: "abcdef012345" }), "fingerprint abcdef012345…");
  assert.equal(subscriptionReference({ originalTransactionId: null, originalFingerprint: null }), "—");
});

test("subscription state: a chain past expiresAt reads as lapsed, with the store's last report", () => {
  const at = "2026-11-05T09:00:00.000Z";
  const past = "2026-09-30T13:14:35.000Z";
  assert.equal(
    subscriptionStateLabel({ status: "active", expiresAt: past }, at),
    `Expired ${whenLabel(past)} (store last reported: active)`,
  );
  assert.match(subscriptionStateLabel({ status: "grace", expiresAt: past }, at), /\(store last reported: grace period\)$/);
  assert.match(subscriptionStateLabel({ status: "active", expiresAt: at }, at), /^Expired /, "expiresAt equal to evaluatedAt has lapsed");
  assert.equal(subscriptionStateLabel({ status: "active", expiresAt: "2026-12-04T00:00:00.000Z" }, at), "Active");
  assert.equal(subscriptionStateLabel({ status: "expired", expiresAt: past }, at), "Expired");
  assert.equal(subscriptionStateLabel({ status: "revoked", expiresAt: past }, at), "Revoked");
  assert.equal(subscriptionStateLabel({ status: "active", expiresAt: "not a date" }, at), "Active");
});

test("filters become a body without empty keys", () => {
  assert.deepEqual(filtersToBody(emptyFilters()), {});
  assert.ok(filtersEmpty(emptyFilters()));
  assert.ok(filtersEmpty({ ...emptyFilters(), player: "   " }));
  const filters = { player: " uid1 ", productId: "hint_pack_5", store: "google", transactionRef: " tok ", orderId: "" };
  assert.deepEqual(filtersToBody(filters), { player: "uid1", productId: "hint_pack_5", store: "google", transactionRef: "tok" });
  assert.deepEqual(filtersToBody(filters, "cur_1-x"), {
    player: "uid1",
    productId: "hint_pack_5",
    store: "google",
    transactionRef: "tok",
    cursor: "cur_1-x",
  });
  assert.deepEqual(filtersToBody(emptyFilters(), null), {});
  assert.ok(!filtersEmpty(filters));
});

test("view pass accepts only a valid principal", () => {
  assert.equal(viewPassPrincipal("firebase:demo-proj:uid-1"), "firebase:demo-proj:uid-1");
  for (const bad of ["uid-1", "", "firebase:demo:", "firebase:bad project:u", "firebase:demo:a/b", "firebase:demo:a\nb"])
    assert.equal(viewPassPrincipal(bad), null, JSON.stringify(bad));
});

test("read failures are worded for staff", () => {
  const base = { status: 0, code: "", error: "", retryAfter: null, body: {} };
  assert.match(readFailureText(base, "x"), /could not be sent/);
  assert.match(readFailureText({ ...base, status: 429, code: "RATE_LIMITED", retryAfter: "12" }, "x"), /12 seconds/);
  assert.match(readFailureText({ ...base, status: 503, code: "BACKEND_UNAVAILABLE" }, "x"), /busy/);
  assert.match(readFailureText({ ...base, status: 404, code: "STORE_UNAVAILABLE" }, "x"), /aren't available/);
  assert.equal(readFailureText({ ...base, status: 400, error: "That id belongs to another Firebase project." }, "x"), "That id belongs to another Firebase project.");
  assert.equal(readFailureText({ ...base, status: 500 }, "fallback"), "fallback");
});

test("whenLabel keeps unparseable text", () => {
  assert.equal(whenLabel("not a date"), "not a date");
  assert.notEqual(whenLabel("2026-11-01T10:00:00.000Z"), "2026-11-01T10:00:00.000Z");
});
