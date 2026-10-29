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
  assert.deepEqual(Object.keys(calls[0].init.headers).sort(), ["Accept", "Authorization"]);
  assert.equal(calls[0].init.redirect, "error", "a redirect never carries the token elsewhere");
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
