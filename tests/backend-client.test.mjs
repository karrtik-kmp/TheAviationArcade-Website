import assert from "node:assert/strict";
import { test } from "node:test";
import { BackendError, BackendNotConnected, backendClient } from "../lib/request/backend.ts";
import { Bearer } from "../lib/request/principal.ts";

function fakeFetch(reply) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return typeof reply === "function" ? reply(url, init) : reply;
  };
  return { fetch, calls };
}
const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

test("sends only the member's bearer: no cookie, no service secret", async () => {
  const { fetch, calls } = fakeFetch(json(200, { ok: true }));
  const client = backendClient({ baseUrl: "http://127.0.0.1:3000/", fetch }, new Bearer("member-token"));
  assert.deepEqual(await client.getJson("/v1/me/progress"), { ok: true });
  assert.equal(calls[0].url, "http://127.0.0.1:3000/v1/me/progress");
  assert.equal(calls[0].init.headers.Authorization, "Bearer member-token");
  assert.deepEqual(Object.keys(calls[0].init.headers).sort(), ["Accept", "Authorization", "X-Client"]);
  assert.equal(calls[0].init.redirect, "error", "a redirect never carries the token elsewhere");
});

test("progress calls carry X-Client: web and never X-Client-Version", async () => {
  const { fetch, calls } = fakeFetch(json(200, {}));
  const client = backendClient({ baseUrl: "http://127.0.0.1:3000", fetch }, new Bearer("t"));
  await client.getJson("/v1/me/progress");
  await client.send("PUT", "/v1/x", {});
  for (const call of calls) {
    assert.equal(call.init.headers["X-Client"], "web", "exempts the website's server from the app version gate");
    assert.equal("X-Client-Version" in call.init.headers, false);
  }
});

test("no base URL means not connected, and nothing is sent", async () => {
  const { fetch, calls } = fakeFetch(json(200, {}));
  for (const baseUrl of [undefined, "", "  "])
    await assert.rejects(backendClient({ baseUrl, fetch }, new Bearer("t")).getJson("/v1/me/progress"), BackendNotConnected);
  assert.equal(calls.length, 0);
});

test("backend errors keep their status, stable code and Retry-After", async () => {
  const { fetch } = fakeFetch(
    json(429, { error: { code: "rate_limited", message: "slow down", requestId: "r1" } }, { "Retry-After": "12" }),
  );
  await assert.rejects(
    backendClient({ baseUrl: "http://b", fetch }, new Bearer("t")).getJson("/x"),
    (e) => e instanceof BackendError && e.status === 429 && e.code === "rate_limited" && e.retryAfter === 12,
  );
});

test("an unreachable backend is status 0, and the token is not in the error", async () => {
  const fetch = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(
    backendClient({ baseUrl: "http://b", fetch }, new Bearer("secret-token")).getJson("/x"),
    (e) => e instanceof BackendError && e.status === 0 && !JSON.stringify({ ...e, m: e.message }).includes("secret-token"),
  );
});

test("send posts JSON with a content type", async () => {
  const { fetch, calls } = fakeFetch(json(200, {}));
  await backendClient({ baseUrl: "http://b", fetch }, new Bearer("t")).send("PUT", "/v1/x", { a: 1 });
  assert.equal(calls[0].init.method, "PUT");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.equal(calls[0].init.body, '{"a":1}');
});

test("Idempotency-Key is sent only when given, and only when valid", async () => {
  const { fetch, calls } = fakeFetch(json(200, {}));
  const client = backendClient({ baseUrl: "http://b", fetch }, new Bearer("t"));
  await client.send("POST", "/v1/x", { a: 1 });
  assert.equal("Idempotency-Key" in calls[0].init.headers, false);
  await client.send("POST", "/v1/x", { a: 1 }, undefined, {});
  assert.equal("Idempotency-Key" in calls[1].init.headers, false);
  await client.send("POST", "/v1/x", new Uint8Array([1]), "image/png", { idempotencyKey: "abc_DEF-123" });
  assert.equal(calls[2].init.headers["Idempotency-Key"], "abc_DEF-123");
  const before = calls.length;
  for (const bad of ["", "has space", "a".repeat(129), "bad/key", "bad\r\nX: y"])
    await assert.rejects(client.send("POST", "/v1/x", new Uint8Array([1]), "image/png", { idempotencyKey: bad }), TypeError, bad);
  assert.equal(calls.length, before, "an invalid key never reaches the network");
});

test("a raw body is sent as is with its own content type, not JSON-stringified", async () => {
  const { fetch, calls } = fakeFetch(json(201, { ok: true }));
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
  await backendClient({ baseUrl: "http://b", fetch }, new Bearer("t")).send("POST", "/v1/admin/media", bytes, "image/jpeg", {
    idempotencyKey: "k1",
  });
  assert.equal(calls[0].init.body, bytes);
  assert.equal(calls[0].init.headers["Content-Type"], "image/jpeg");
});

test("sendWithStatus returns the success status with the body; send and getJson return the body alone", async () => {
  const { fetch } = fakeFetch(() => json(201, { id: "med-1" }));
  const client = backendClient({ baseUrl: "http://b", fetch }, new Bearer("t"));
  assert.deepEqual(await client.sendWithStatus("POST", "/v1/x", new Uint8Array([1]), "image/png"), { status: 201, body: { id: "med-1" } });
  assert.deepEqual(await client.send("POST", "/v1/x", {}), { id: "med-1" });
  assert.deepEqual(await client.getJson("/v1/x"), { id: "med-1" });
  const failing = backendClient({ baseUrl: "http://b", fetch: async () => json(422, { error: { code: "media_invalid" } }) }, new Bearer("t"));
  await assert.rejects(failing.sendWithStatus("POST", "/v1/x", new Uint8Array([1]), "image/png"), (e) => e instanceof BackendError && e.status === 422 && e.code === "media_invalid");
});

test("a per-call timeout overrides the client's", async () => {
  const waits = (url, init) =>
    new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  const client = backendClient({ baseUrl: "http://b", fetch: waits, timeoutMs: 60000 }, new Bearer("t"));
  const started = Date.now();
  await assert.rejects(
    client.send("POST", "/v1/x", {}, undefined, { timeoutMs: 30 }),
    (e) => e instanceof BackendError && e.status === 0,
  );
  assert.ok(Date.now() - started < 5000, "the 30 ms call timeout applied, not the 60 s client one");
});
