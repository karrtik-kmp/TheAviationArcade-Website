import test from "node:test";
import assert from "node:assert/strict";
import {
  createPolicyCache,
  pageOrigin,
  policyRenderUrl,
  POLICY_FRESH_MS,
  POLICY_STALE_MS,
} from "../lib/policy-embed.ts";

const POLICY = `<style>#k{}</style><article><h2>Privacy Policy</h2>${"<p>Text.</p>".repeat(20)}</article>`;
const ORIGIN = "https://dev.playairplanegames.com/privacy";

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return new Response(next.body ?? "", { status: next.status ?? 200 });
  };
  return { impl, calls };
}

test("the render URL carries the policy key and the page as origin, like the embed script", () => {
  assert.equal(
    policyRenderUrl("abc=", ORIGIN),
    "https://embed.termageddon.com/api/render/abc%3D?origin=https%3A%2F%2Fdev.playairplanegames.com%2Fprivacy",
  );
});

test("the page origin comes from the proxied host and protocol", () => {
  const h = (init) => new Headers(init);
  assert.equal(pageOrigin(h({ host: "dev.playairplanegames.com" }), "/privacy"), ORIGIN);
  assert.equal(
    pageOrigin(h({ host: "127.0.0.1:3000", "x-forwarded-host": "PlayAirplaneGames.com", "x-forwarded-proto": "https" }), "/terms"),
    "https://playairplanegames.com/terms",
  );
  assert.equal(pageOrigin(h({ host: "localhost:5173", "x-forwarded-proto": "http" }), "/cookies"), "http://localhost:5173/cookies");
  assert.equal(pageOrigin(h({ host: "evil.com/x?y" }), "/privacy"), null);
  assert.equal(pageOrigin(h({}), "/privacy"), null);
});

test("a policy is fetched once and served from the cache while fresh", async () => {
  let now = 0;
  const { impl, calls } = fakeFetch([{ body: POLICY }]);
  const policyHtml = createPolicyCache();
  assert.equal(await policyHtml("k", ORIGIN, { fetch: impl, now: () => now }), POLICY);
  now = POLICY_FRESH_MS - 1;
  assert.equal(await policyHtml("k", ORIGIN, { fetch: impl, now: () => now }), POLICY);
  assert.equal(calls.length, 1);
});

test("concurrent requests share one fetch", async () => {
  const { impl, calls } = fakeFetch([{ body: POLICY }]);
  const policyHtml = createPolicyCache();
  const [a, b] = await Promise.all([policyHtml("k", ORIGIN, { fetch: impl }), policyHtml("k", ORIGIN, { fetch: impl })]);
  assert.equal(a, POLICY);
  assert.equal(b, POLICY);
  assert.equal(calls.length, 1);
});

test("a failed refresh serves the day-old copy, then nothing once it is too old", async () => {
  let now = 0;
  const { impl, calls } = fakeFetch([{ body: POLICY }, { status: 503 }, new Error("offline")]);
  const policyHtml = createPolicyCache();
  await policyHtml("k", ORIGIN, { fetch: impl, now: () => now });
  now = POLICY_FRESH_MS + 1;
  assert.equal(await policyHtml("k", ORIGIN, { fetch: impl, now: () => now }), POLICY);
  now = POLICY_STALE_MS + 1;
  assert.equal(await policyHtml("k", ORIGIN, { fetch: impl, now: () => now }), null);
  assert.equal(calls.length, 3);
});

test("errors and empty answers give null so the browser fallback runs", async () => {
  const policyHtml = createPolicyCache();
  for (const response of [{ status: 404 }, { body: "  " }, new Error("timeout")]) {
    const { impl } = fakeFetch([response]);
    assert.equal(await policyHtml("k", ORIGIN, { fetch: impl }), null);
  }
});
