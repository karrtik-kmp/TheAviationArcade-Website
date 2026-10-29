import assert from "node:assert/strict";
import { test } from "node:test";
import { createDraftSession } from "../lib/editorial/draft-session.ts";

/** A fake server: records each request and answers with whatever the test queues. */
function harness() {
  const sent = [];
  const replies = [];
  let active = true;
  let hold = null;
  const session = createDraftSession({
    isActive: () => active,
    async send(method, url, payload) {
      sent.push({ method, url, payload });
      if (hold) await hold;
      return replies.shift() ?? { ok: true, status: 200, body: {} };
    },
  });
  return {
    session,
    sent,
    reply: (status, body = {}) => replies.push({ ok: status < 400, status, body }),
    deactivate: () => (active = false),
    holdNext() {
      let release;
      hold = new Promise((resolve) => (release = resolve));
      return () => {
        hold = null;
        release();
      };
    },
  };
}
const adopt = (body) => body.record?.version;

test("the base version is the one captured at open, not the latest list", async () => {
  const h = harness();
  h.session.open("content:a", 3);
  // A background refresh shows version 5 elsewhere; the form still saves against 3.
  h.reply(200, { record: { version: 4 } });
  const outcome = await h.session.save("content:a", "PUT", "/api/admin/content/a", { status: "draft" }, adopt);
  assert.equal(outcome.kind, "ok");
  assert.deepEqual(h.sent[0].payload, { status: "draft", version: 3 });
  assert.equal(h.session.baseVersion("content:a"), 4, "success adopts the server's version");
});

test("a conflict keeps the base and never adopts another editor's version", async () => {
  const h = harness();
  h.session.open("content:a", 3);
  h.reply(409, { error: "This content changed. Refresh before saving.", record: { version: 9 } });
  const outcome = await h.session.save("content:a", "PUT", "/x", {}, adopt);
  assert.deepEqual(outcome, { kind: "conflict", message: "This content changed. Refresh before saving." });
  assert.equal(h.session.baseVersion("content:a"), 3);
});

test("401, 403 and ACCOUNT_CHANGED block the desk", async () => {
  const h = harness();
  h.session.open("k", 1);
  h.reply(401);
  assert.deepEqual(await h.session.save("k", "PUT", "/x", {}, adopt), { kind: "blocked", status: 401 });
  h.reply(403, { code: "DEMO_ACCOUNT" });
  assert.deepEqual(await h.session.request("GET", "/x"), { kind: "blocked", status: 403 });
  h.reply(409, { code: "ACCOUNT_CHANGED", error: "Your signed-in account changed." });
  assert.deepEqual(await h.session.request("POST", "/x", {}), { kind: "blocked", status: 409 });
});

test("a refusal keeps every reason the server gave", async () => {
  const h = harness();
  h.reply(422, { error: "This batch cannot be released yet.", errors: ["Trainee: 0 of 6 questions approved."] });
  assert.deepEqual(await h.session.request("POST", "/api/admin/military/releases", {}), {
    kind: "refused",
    status: 422,
    message: "This batch cannot be released yet.",
    errors: ["Trainee: 0 of 6 questions approved."],
  });
});

test("an account change mid-flight makes the response stale", async () => {
  const h = harness();
  h.session.open("k", 1);
  const release = h.holdNext();
  h.reply(200, { record: { version: 2 } });
  const pending = h.session.save("k", "PUT", "/x", {}, adopt);
  h.session.reset();
  release();
  assert.deepEqual(await pending, { kind: "stale" });
  assert.equal(h.session.baseVersion("k"), null, "reset forgets every base version");
});

test("a response that arrives after the account stopped being active is stale", async () => {
  const h = harness();
  const release = h.holdNext();
  const pending = h.session.request("GET", "/x");
  h.deactivate();
  release();
  assert.deepEqual(await pending, { kind: "stale" });
  assert.equal((await h.session.request("GET", "/x")).kind, "inactive", "nothing is sent while inactive");
  assert.equal(h.sent.length, 1);
});

test("release and restore carry the live pointer version", async () => {
  const h = harness();
  h.session.open("military-live", 2);
  h.reply(200, { pointer: { version: 3 } });
  await h.session.save(
    "military-live",
    "POST",
    "/api/admin/military/releases",
    { basis: "b", previewed: true },
    (body) => body.pointer?.version,
    "pointerVersion",
  );
  assert.deepEqual(h.sent[0].payload, { basis: "b", previewed: true, pointerVersion: 2 });
  assert.equal(h.session.baseVersion("military-live"), 3);
});

test("saving an item that was never opened sends nothing", async () => {
  const h = harness();
  assert.equal((await h.session.save("nope", "PUT", "/x", {}, adopt)).kind, "inactive");
  assert.equal(h.sent.length, 0);
});
