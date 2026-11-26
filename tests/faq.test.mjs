import test from "node:test";
import assert from "node:assert/strict";
import { createFaqCache, FAQ_FRESH_MS, FAQ_STALE_MS, parseFaqPublic, visibleCategories } from "../lib/faq.ts";

const doc = (overrides = {}) => ({
  format: "faq.v1",
  version: 3,
  publishedAt: "2026-11-26T10:00:00.000Z",
  categories: [
    { id: "account", title: "Account", entries: [{ id: "reset", question: "How do I reset?", answer: "Use /sign-in.\n\nThen check mail." }] },
    { id: "empty", title: "Empty", entries: [] },
  ],
  ...overrides,
});

function fakeBackend(responses) {
  const calls = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, headers: init.headers });
      const next = responses.shift();
      if (!next) throw new Error("no more responses");
      if (next instanceof Error) throw next;
      return next;
    },
  };
}
const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const clock = () => {
  let t = 1_000_000;
  return { now: () => t, advance: (ms) => (t += ms) };
};
const cacheWith = (backend, c, baseUrl = "https://api.example/") =>
  createFaqCache({ baseUrl: () => baseUrl, fetch: backend.fetch, now: c.now });

test("parseFaqPublic accepts the contract shape and drops nothing", () => {
  const faq = parseFaqPublic(doc());
  assert.equal(faq.version, 3);
  assert.equal(faq.categories.length, 2);
  assert.deepEqual(visibleCategories(faq).map((c) => c.id), ["account"]);
});

test("parseFaqPublic refuses anything outside the contract", () => {
  const entry = { id: "a", question: "Q?", answer: "A." };
  const bad = [
    null,
    [],
    doc({ format: "faq.v2" }),
    doc({ version: 0 }),
    doc({ version: 1.5 }),
    doc({ publishedAt: "yesterday" }),
    { ...doc(), extra: 1 },
    doc({ categories: [{ id: "A", title: "T", entries: [] }] }),
    doc({ categories: [{ id: "a", title: "T", entries: [], x: 1 }] }),
    doc({ categories: [{ id: "a", title: "", entries: [] }] }),
    doc({ categories: [{ id: "a", title: " padded", entries: [] }] }),
    doc({ categories: [{ id: "a", title: "Two\nlines", entries: [] }] }),
    doc({ categories: [{ id: "a", title: "x".repeat(81), entries: [] }] }),
    doc({ categories: [{ id: "a", title: "T", entries: [] }, { id: "a", title: "U", entries: [] }] }),
    doc({ categories: [{ id: "a", title: "T", entries: [entry] }, { id: "b", title: "U", entries: [entry] }] }),
    doc({ categories: [{ id: "a", title: "T", entries: [{ ...entry, question: "Two\nlines" }] }] }),
    doc({ categories: [{ id: "a", title: "T", entries: [{ ...entry, answer: "x".repeat(2001) }] }] }),
    doc({ categories: [{ id: "a", title: "T", entries: [{ ...entry, html: "<b>" }] }] }),
    doc({ categories: Array.from({ length: 31 }, (_, i) => ({ id: `c${i}`, title: "T", entries: [] })) }),
    doc({
      categories: Array.from({ length: 2 }, (_, c) => ({
        id: `c${c}`,
        title: "T",
        entries: Array.from({ length: 151 }, (_, e) => ({ id: `e${c}-${e}`, question: "Q", answer: "A" })),
      })),
    }),
  ];
  for (const body of bad) assert.equal(parseFaqPublic(body), null, JSON.stringify(body)?.slice(0, 120));
});

test("lengths count code points, not UTF-16 units", () => {
  // "🛩" is one code point but two UTF-16 units, so 80 of them is 160 units and still a valid title.
  assert.ok(parseFaqPublic(doc({ categories: [{ id: "a", title: "🛩".repeat(80), entries: [] }] })));
  assert.equal(parseFaqPublic(doc({ categories: [{ id: "a", title: "🛩".repeat(81), entries: [] }] })), null);
});

test("a fresh copy is served without asking again; after 60 s the ETag is sent and 304 keeps it", async () => {
  const c = clock();
  const backend = fakeBackend([json(200, doc(), { ETag: '"abc"' }), new Response(null, { status: 304, headers: { ETag: '"abc"' } })]);
  const getFaq = cacheWith(backend, c);
  assert.equal((await getFaq()).state, "published");
  assert.equal(backend.calls[0].url, "https://api.example/v1/public/faq");
  assert.equal(backend.calls[0].headers["If-None-Match"], undefined);
  c.advance(FAQ_FRESH_MS - 1);
  assert.equal((await getFaq()).state, "published");
  assert.equal(backend.calls.length, 1);
  c.advance(1);
  const again = await getFaq();
  assert.equal(again.state, "published");
  assert.equal(again.faq.version, 3);
  assert.equal(backend.calls[1].headers["If-None-Match"], '"abc"');
});

test("404 before the first publish is 'none' and is cached for a minute", async () => {
  const c = clock();
  const backend = fakeBackend([json(404, { error: { code: "not_found" } })]);
  const getFaq = cacheWith(backend, c);
  assert.deepEqual(await getFaq(), { state: "none" });
  assert.deepEqual(await getFaq(), { state: "none" });
  assert.equal(backend.calls.length, 1);
});

test("no backend URL: 'none', and nothing is fetched", async () => {
  const backend = fakeBackend([]);
  const getFaq = cacheWith(backend, clock(), "");
  assert.deepEqual(await getFaq(), { state: "none" });
  assert.equal(backend.calls.length, 0);
});

test("a failure keeps serving the last good copy for a day, then 'unavailable'", async () => {
  const c = clock();
  const backend = fakeBackend([
    json(200, doc()),
    json(503, { error: { code: "unavailable" } }),
    new Error("network down"),
    json(500, {}),
  ]);
  const getFaq = cacheWith(backend, c);
  await getFaq();
  c.advance(FAQ_FRESH_MS);
  assert.equal((await getFaq()).state, "published");
  c.advance(FAQ_FRESH_MS);
  assert.equal((await getFaq()).state, "published");
  c.advance(FAQ_STALE_MS);
  assert.deepEqual(await getFaq(), { state: "unavailable" });
});

test("a failure with no copy is 'unavailable' and waits before asking again", async () => {
  const c = clock();
  const backend = fakeBackend([new Error("down"), json(200, doc())]);
  const getFaq = cacheWith(backend, c);
  assert.deepEqual(await getFaq(), { state: "unavailable" });
  assert.deepEqual(await getFaq(), { state: "unavailable" });
  assert.equal(backend.calls.length, 1);
  c.advance(FAQ_FRESH_MS);
  assert.equal((await getFaq()).state, "published");
});

test("429 Retry-After is honoured (capped) and the copy is kept", async () => {
  const c = clock();
  const backend = fakeBackend([json(200, doc()), json(429, {}, { "Retry-After": "300" }), json(200, doc({ version: 4 }))]);
  const getFaq = cacheWith(backend, c);
  await getFaq();
  c.advance(FAQ_FRESH_MS);
  assert.equal((await getFaq()).faq.version, 3);
  c.advance(299_000);
  await getFaq();
  assert.equal(backend.calls.length, 2);
  c.advance(1_000);
  assert.equal((await getFaq()).faq.version, 4);
});

test("a malformed 200 body is a failure: the previous copy stays", async () => {
  const c = clock();
  const backend = fakeBackend([json(200, doc()), json(200, { format: "faq.v1" }), new Response("not json", { status: 200 })]);
  const getFaq = cacheWith(backend, c);
  await getFaq();
  c.advance(FAQ_FRESH_MS);
  assert.equal((await getFaq()).faq.version, 3);
  c.advance(FAQ_FRESH_MS);
  assert.equal((await getFaq()).faq.version, 3);
});

test("a 304 with no copy in hand is not trusted", async () => {
  const c = clock();
  const backend = fakeBackend([new Response(null, { status: 304 })]);
  assert.deepEqual(await cacheWith(backend, c)(), { state: "unavailable" });
});

test("concurrent requests share one backend call", async () => {
  const c = clock();
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  let calls = 0;
  const getFaq = createFaqCache({
    baseUrl: () => "https://api.example",
    now: c.now,
    fetch: async () => {
      calls += 1;
      await gate;
      return json(200, doc());
    },
  });
  const all = Promise.all([getFaq(), getFaq(), getFaq()]);
  release();
  const results = await all;
  assert.equal(calls, 1);
  assert.ok(results.every((r) => r.state === "published"));
});
