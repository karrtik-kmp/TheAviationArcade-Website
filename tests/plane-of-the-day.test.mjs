import test from "node:test";
import assert from "node:assert/strict";
import {
  createPlaneOfTheDayCache,
  parsePlaneOfTheDay,
  POTD_FRESH_MS,
  POTD_STALE_MS,
} from "../lib/plane-of-the-day.ts";
import { dispatch } from "../lib/request/router.ts";
import { routes } from "../lib/request/routes.ts";

const T0 = Date.parse("2026-11-27T12:00:00.000Z");
const licence = (overrides = {}) => ({
  credit: "A. Pilot",
  licenceName: "CC BY 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
  sourceUrl: "https://example.org/photo",
  attributionText: null,
  creditRequired: true,
  ...overrides,
});
const image = (overrides = {}) => ({
  mediaId: "med-7",
  version: 1,
  sha256: "a".repeat(64),
  url: "https://cdn.example/med-7.jpg?token=x",
  expiresAt: new Date(T0 + 24 * 3600 * 1000).toISOString(),
  reason: null,
  contentType: "image/jpeg",
  width: 1600,
  height: 1067,
  licence: licence(),
  ...overrides,
});
const feature = (overrides = {}) => ({
  id: "ed-12",
  date: "2026-11-27",
  title: "Threshold",
  aircraft: "Boeing 757",
  photographer: "Staff-typed name",
  instagram: "@someone",
  description: "A familiar aircraft from a different angle.",
  image: image(),
  ...overrides,
});
const body = (features = [feature()], day = "2026-11-27") => ({ day, features });

function fakeBackend(responses) {
  const calls = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error("no more responses");
      if (next instanceof Error) throw next;
      if (typeof next === "function") return next(init);
      return next;
    },
  };
}
const json = (status, payload, headers = {}) =>
  new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json", ...headers } });
const clock = () => {
  let t = T0;
  return { now: () => t, advance: (ms) => (t += ms) };
};
const cacheWith = (backend, c, extra = {}) =>
  createPlaneOfTheDayCache({ baseUrl: () => "https://api.example/", fetch: backend.fetch, now: c.now, ...extra });

// ===== Contract parse =====

test("parse accepts the contract shape and keeps only public fields", () => {
  const parsed = parsePlaneOfTheDay(body());
  assert.equal(parsed.day, "2026-11-27");
  const [f] = parsed.features;
  assert.deepEqual(Object.keys(f).sort(), ["aircraft", "date", "description", "id", "image", "title"]);
  assert.equal(f.image.licence.credit, "A. Pilot");
  assert.ok(!JSON.stringify(parsed).includes("someone"), "instagram never leaves the reader");
  assert.ok(!JSON.stringify(parsed).includes("Staff-typed"), "photographer never leaves the reader");
});

test("parse accepts an empty list", () => {
  assert.deepEqual(parsePlaneOfTheDay(body([])), { day: "2026-11-27", features: [] });
});

test("parse accepts a null image link (no CDN) and a fully null licence (dev waiver)", () => {
  const nullLink = image({ url: null, expiresAt: null, reason: "cdn_not_configured" });
  const nullLicence = licence({ credit: null, licenceName: null, licenceUrl: null, sourceUrl: null, creditRequired: false });
  const [a, b] = parsePlaneOfTheDay(body([feature({ image: nullLink }), feature({ id: "ed-13", image: image({ licence: nullLicence }) })])).features;
  assert.equal(a.image.url, null);
  assert.equal(a.image.expiresAt, null);
  assert.deepEqual(b.image.licence, { credit: null, licenceName: null, licenceUrl: null, sourceUrl: null, attributionText: null });
});

test("parse drops links the page may not show (http) without failing the body", () => {
  const [f] = parsePlaneOfTheDay(
    body([feature({ image: image({ url: "http://cdn.example/x.jpg", licence: licence({ sourceUrl: "http://example.org" }) }) })]),
  ).features;
  assert.equal(f.image.url, null, "an http image would be mixed content");
  assert.equal(f.image.licence.sourceUrl, null);
  assert.equal(f.image.licence.licenceUrl, "https://creativecommons.org/licenses/by/4.0/");
});

test("parse refuses anything outside the contract", () => {
  const bad = [
    null,
    [],
    "text",
    { day: "2026-11-27" },
    { ...body(), extra: 1 },
    body([], "27-11-2026"),
    body(Array.from({ length: 101 }, (_, i) => feature({ id: `ed-${i + 1}` }))),
    body([{ ...feature(), extra: 1 }]),
    body([(({ instagram, ...rest }) => rest)(feature())]),
    body([feature({ id: "12" })]),
    body([feature({ id: "ed-012" })]),
    body([feature({ date: "today" })]),
    body([feature({ title: 7 })]),
    body([feature({ instagram: null })]),
    body([feature({ image: null })]),
    body([feature({ image: image({ mediaId: "med-0" }) })]),
    body([feature({ image: image({ version: 0 }) })]),
    body([feature({ image: image({ sha256: "A".repeat(64) }) })]),
    body([feature({ image: image({ contentType: "image/gif" }) })]),
    body([feature({ image: image({ width: 0 }) })]),
    body([feature({ image: image({ height: 4097 }) })]),
    body([feature({ image: image({ url: null }) })]),
    body([feature({ image: image({ url: null, expiresAt: null, reason: null }) })]),
    body([feature({ image: image({ reason: "cdn_not_configured" }) })]),
    body([feature({ image: image({ url: "not a url" }) })]),
    body([feature({ image: image({ expiresAt: "soon" }) })]),
    body([feature({ image: image({ licence: null }) })]),
    body([feature({ image: image({ licence: { ...licence(), extra: 1 } }) })]),
    body([feature({ image: image({ licence: licence({ credit: "" }) }) })]),
    body([feature({ image: image({ licence: licence({ credit: "x".repeat(201) }) }) })]),
    body([feature({ image: image({ licence: licence({ licenceUrl: "javascript:alert(1)" }) }) })]),
    body([feature({ image: image({ licence: licence({ creditRequired: "yes" }) }) })]),
  ];
  for (const [i, value] of bad.entries()) assert.equal(parsePlaneOfTheDay(value), null, `case ${i}`);
});

// ===== Cache =====

test("asks the backend with the time zone, then serves from cache inside the fresh window", async () => {
  const backend = fakeBackend([json(200, body())]);
  const c = clock();
  const get = cacheWith(backend, c);
  const first = await get("Europe/London", "2026-11-27");
  assert.equal(first.state, "ok");
  assert.equal(first.features[0].id, "ed-12");
  assert.equal(backend.calls[0].url, "https://api.example/v1/public/plane-of-the-day?timeZone=Europe%2FLondon");
  assert.equal(backend.calls[0].init.redirect, "manual");
  c.advance(POTD_FRESH_MS - 1);
  assert.equal((await get("Europe/London", "2026-11-27")).state, "ok");
  assert.equal(backend.calls.length, 1);
});

test("the cache key is the viewer's day: two zones on the same day share one request", async () => {
  const backend = fakeBackend([json(200, body())]);
  const get = cacheWith(backend, clock());
  await get("Europe/London", "2026-11-27");
  await get("Africa/Lagos", "2026-11-27");
  assert.equal(backend.calls.length, 1);
});

test("one request in flight for concurrent guests", async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const backend = fakeBackend([async () => (await gate, json(200, body()))]);
  const get = cacheWith(backend, clock());
  const pending = [get("UTC", "2026-11-27"), get("UTC", "2026-11-27"), get("UTC", "2026-11-27")];
  release();
  const results = await Promise.all(pending);
  assert.equal(backend.calls.length, 1);
  assert.ok(results.every((r) => r.state === "ok"));
});

test("an empty list is a normal answer, not a failure", async () => {
  const get = cacheWith(fakeBackend([json(200, body([]))]), clock());
  assert.deepEqual(await get("UTC", "2026-11-27"), { state: "ok", day: "2026-11-27", features: [] });
});

test("429 with a stale copy: the copy is served and Retry-After is honoured", async () => {
  const backend = fakeBackend([json(200, body()), json(429, { error: "slow down" }, { "Retry-After": "300" }), json(200, body([]))]);
  const c = clock();
  const get = cacheWith(backend, c);
  await get("UTC", "2026-11-27");
  c.advance(POTD_FRESH_MS);
  const stale = await get("UTC", "2026-11-27");
  assert.equal(stale.state, "ok");
  assert.equal(stale.features.length, 1, "the last good copy");
  c.advance(299 * 1000);
  await get("UTC", "2026-11-27");
  assert.equal(backend.calls.length, 2, "no request before Retry-After");
  c.advance(1000);
  assert.equal((await get("UTC", "2026-11-27")).features.length, 0);
  assert.equal(backend.calls.length, 3);
});

test("5xx and a malformed body keep the stale copy; with no copy the read is unavailable", async () => {
  const c = clock();
  const empty = cacheWith(fakeBackend([json(503, {}), json(200, { day: "x" })]), c);
  assert.deepEqual(await empty("UTC", "2026-11-27"), { state: "unavailable" });
  c.advance(POTD_FRESH_MS);
  assert.deepEqual(await empty("UTC", "2026-11-27"), { state: "unavailable" });

  const backend = fakeBackend([json(200, body()), json(500, {}), json(200, { nope: true })]);
  const get = cacheWith(backend, c);
  await get("UTC", "2026-11-27");
  for (let i = 0; i < 2; i++) {
    c.advance(POTD_FRESH_MS);
    assert.equal((await get("UTC", "2026-11-27")).features[0].id, "ed-12");
  }
});

test("a stale copy is dropped after a day", async () => {
  const backend = fakeBackend([json(200, body()), ...Array.from({ length: 30 }, () => json(503, {}))]);
  const c = clock();
  const get = cacheWith(backend, c);
  await get("UTC", "2026-11-27");
  c.advance(POTD_STALE_MS);
  assert.deepEqual(await get("UTC", "2026-11-27"), { state: "unavailable" });
});

test("a timeout counts as a failure and is retried after the fresh window", async () => {
  const hang = (init) =>
    new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  const backend = fakeBackend([hang, json(200, body())]);
  const c = clock();
  const get = cacheWith(backend, c, { timeoutMs: 20 });
  assert.deepEqual(await get("UTC", "2026-11-27"), { state: "unavailable" });
  await get("UTC", "2026-11-27");
  assert.equal(backend.calls.length, 1, "no retry inside the fresh window");
  c.advance(POTD_FRESH_MS);
  assert.equal((await get("UTC", "2026-11-27")).state, "ok");
});

test("a stale copy past an image link's expiry serves no image, never the dead link", async () => {
  const soon = new Date(T0 + 2 * 60 * 1000).toISOString();
  const backend = fakeBackend([json(200, body([feature({ image: image({ expiresAt: soon }) })])), json(503, {}), json(503, {})]);
  const c = clock();
  const get = cacheWith(backend, c);
  assert.ok((await get("UTC", "2026-11-27")).features[0].image.url);
  c.advance(POTD_FRESH_MS);
  assert.ok((await get("UTC", "2026-11-27")).features[0].image.url, "still valid");
  c.advance(POTD_FRESH_MS);
  const after = (await get("UTC", "2026-11-27")).features[0];
  assert.equal(after.image.url, null);
  assert.equal(after.title, "Threshold", "the feature itself stays");
});

test("a stale copy across midnight: the new day falls back to the last copy, labelled with the new day", async () => {
  const backend = fakeBackend([json(200, body()), json(503, {}), json(200, body([], "2026-11-28"))]);
  const c = clock();
  const get = cacheWith(backend, c);
  await get("UTC", "2026-11-27");
  c.advance(12 * 3600 * 1000);
  const fallback = await get("UTC", "2026-11-28");
  assert.equal(backend.calls.length, 2, "the new day asks the backend");
  assert.equal(fallback.day, "2026-11-28", "never yesterday's day, so yesterday's feature is not called today's");
  assert.equal(fallback.features[0].date, "2026-11-27");
  c.advance(POTD_FRESH_MS);
  assert.deepEqual(await get("UTC", "2026-11-28"), { state: "ok", day: "2026-11-28", features: [] }, "its own answer wins");
});

test("a backend already on the next day: labelled with the viewer's day, tomorrow's feature left out", async () => {
  const early = body([feature({ id: "ed-13", date: "2026-11-28" }), feature()], "2026-11-28");
  const get = cacheWith(fakeBackend([json(200, early)]), clock());
  const result = await get("UTC", "2026-11-27");
  assert.equal(result.day, "2026-11-27");
  assert.deepEqual(result.features.map((f) => f.id), ["ed-12"]);
});

test("no backend configured is unavailable and nothing is asked", async () => {
  const backend = fakeBackend([]);
  const get = createPlaneOfTheDayCache({ baseUrl: () => "", fetch: backend.fetch });
  assert.deepEqual(await get("UTC", "2026-11-27"), { state: "unavailable" });
  assert.equal(backend.calls.length, 0);
});

// ===== /api/featured =====

function featuredRoute(result) {
  const asked = [];
  const handle = dispatch(routes, {
    principal: async () => {
      throw new Error("a public route never resolves a principal");
    },
    planeOfTheDay: async (zone, day) => (asked.push([zone, day]), result),
    backend: () => {
      throw new Error("not used");
    },
  });
  const call = async (query = "") => {
    const response = await handle(new Request(`http://site.test/api/featured${query}`), ["featured"]);
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  return { call, asked };
}

test("/api/featured keeps { featured, archive }, adds day, and carries only the licence credit", async () => {
  const parsed = parsePlaneOfTheDay(
    body([feature(), feature({ id: "ed-11", date: "2026-11-26", image: image({ url: null, expiresAt: null, reason: "cdn_not_configured" }) })]),
  );
  const { call, asked } = featuredRoute({ state: "ok", ...parsed });
  const res = await call("?timeZone=Europe/London");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(asked[0][0], "Europe/London");
  assert.match(asked[0][1], /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(res.body.day, "2026-11-27");
  assert.deepEqual(res.body.featured, {
    id: "ed-12",
    date: "2026-11-27",
    title: "Threshold",
    aircraft: "Boeing 757",
    description: "A familiar aircraft from a different angle.",
    credit: "A. Pilot",
    licenceName: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://example.org/photo",
    attribution: null,
    imageUrl: "https://cdn.example/med-7.jpg?token=x",
    width: 1600,
    height: 1067,
  });
  assert.deepEqual(res.body.archive.map((p) => [p.id, p.imageUrl]), [["ed-11", null]], "the archive skips the feature");
  const text = JSON.stringify(res.body);
  assert.ok(!text.includes("someone") && !text.includes("Staff-typed"));
});

test("/api/featured: empty is 200; unavailable is 503; an unknown zone is 422; a zone the backend refuses reads as UTC", async () => {
  const empty = await featuredRoute({ state: "ok", day: "2026-11-27", features: [] }).call();
  assert.deepEqual([empty.status, empty.body], [200, { day: "2026-11-27", featured: null, archive: [] }]);
  assert.equal((await featuredRoute({ state: "unavailable" }).call()).status, 503);
  const { call: bad, asked: none } = featuredRoute({ state: "unavailable" });
  assert.equal((await bad("?timeZone=Not/AZone")).status, 422, "a name Intl refuses");
  assert.equal(none.length, 0, "a bad zone never reaches the backend");
  for (const zone of ["Etc/GMT+5", "+02:00", "-05", "x".repeat(65)]) {
    const { call, asked } = featuredRoute({ state: "ok", day: "2026-11-27", features: [] });
    assert.equal((await call(`?timeZone=${encodeURIComponent(zone)}`)).status, 200, zone);
    assert.equal(asked[0][0], "UTC", `${zone} reads as UTC, never sent to the backend`);
  }
});

test("the old image route is gone", async () => {
  assert.ok(!routes.some((r) => r.path.startsWith("photos")));
});
