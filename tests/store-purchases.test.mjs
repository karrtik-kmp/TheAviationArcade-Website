import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// ===== Contract tests =====

const store = await import("../lib/request/store.ts");
const yaml = await readFile(new URL("../contracts/openapi.yaml", import.meta.url), "utf8");

const block = (name) => {
  const start = yaml.indexOf(`\n    ${name}:\n`);
  assert.ok(start >= 0, `${name} is in the contract`);
  const rest = yaml.slice(start + name.length + 7);
  const end = rest.search(/\n {4}[A-Za-z]/);
  return end < 0 ? rest : rest.slice(0, end);
};
const list = (text, key, indent = 6) => {
  const found = text.match(new RegExp(String.raw`\n {${indent}}${key}: \[([^\]]*)\]`));
  assert.ok(found, key);
  return found[1].split(",").map((s) => s.trim()).filter(Boolean).sort();
};
const keys = (schema) => Object.keys(schema.shape).sort();
const propertyNames = (text) => {
  const after = text.slice(text.indexOf("properties:"));
  const indent = after.match(/\n( +)\S/)[1].length;
  return [...after.matchAll(new RegExp(String.raw`\n {${indent}}([A-Za-z]+):`, "g"))].map((m) => m[1]);
};

const at = "2026-11-04T10:00:00.000Z";
const until = "2026-12-04T10:00:00.000Z";
const hintsPurchase = {
  id: 7,
  store: "apple",
  principal: "firebase:demo-airplane-games:buyer",
  productId: "hints.pack_5",
  kind: "hint_pack",
  environment: "sandbox",
  transactionId: "2000000123",
  originalTransactionId: null,
  orderId: null,
  tokenFingerprint: null,
  originalFingerprint: null,
  purchasedAt: at,
  grant: { type: "hints", hints: 5 },
  createdAt: at,
};
const passPurchase = {
  ...hintsPurchase,
  id: 6,
  store: "google",
  productId: "pass.monthly",
  kind: "first_class_pass",
  environment: "production",
  transactionId: null,
  orderId: "GPA.1234-5678",
  originalFingerprint: "abcdef012345",
  grant: { type: "first_class_pass", until },
};
const subscription = {
  store: "google",
  originalTransactionId: null,
  originalFingerprint: "abcdef012345",
  productId: "pass.monthly",
  status: "active",
  expiresAt: until,
  lastEventAt: at,
  createdAt: at,
};
const entitlements = {
  principal: "firebase:demo-airplane-games:buyer",
  firstClassPass: true,
  firstClassUntil: until,
  productId: "pass.monthly",
  evaluatedAt: at,
  hasStoreAccount: true,
  subscriptions: [subscription],
};

test("staff purchase schemas list the contract's keys, enums and paths", () => {
  assert.deepEqual(propertyNames(block("StaffStorePurchase")).sort(), keys(store.staffStorePurchaseSchema));
  assert.deepEqual(list(block("StaffStorePurchase"), "required"), keys(store.staffStorePurchaseSchema));
  assert.deepEqual(list(block("StaffStorePurchaseList"), "required"), keys(store.staffStorePurchaseListSchema));
  assert.deepEqual(propertyNames(block("StaffStoreSubscription")).sort(), keys(store.staffStoreSubscriptionSchema));
  assert.deepEqual(list(block("StaffStoreSubscription"), "required"), keys(store.staffStoreSubscriptionSchema));
  assert.deepEqual(propertyNames(block("StaffEntitlements")).sort(), keys(store.staffEntitlementsSchema));
  assert.deepEqual(list(block("StaffEntitlements"), "required"), keys(store.staffEntitlementsSchema));
  assert.ok(block("StaffStorePurchase").includes(`environment: { type: string, enum: [${store.storeEnvironments.join(", ")}] }`));
  assert.ok(block("StaffStoreSubscription").includes(`enum: [${store.storeSubscriptionStatuses.join(", ")}]`));
  assert.ok(block("StaffStorePurchaseList").includes(`pattern: "^[A-Za-z0-9_-]{1,100}$"`));
  assert.deepEqual(list(block("StoreName"), "enum", 6), [...store.storeNames].sort());
  // The two grant shapes of the contract.
  const grant = block("StaffStoreGrant");
  assert.ok(grant.includes("required: [type, hints]") && grant.includes("required: [type, until]"));
  assert.ok(grant.includes("const: hints") && grant.includes("const: first_class_pass"));
  assert.ok(grant.includes("required: [type, miles]") && grant.includes("const: miles"));
  for (const path of ["/v1/admin/store/purchases:", "/v1/admin/store/players/{principal}/entitlements:"])
    assert.ok(yaml.includes(`\n  ${path}\n`), path);
});

test("grant variants: known shapes are strict, an unknown type passes through", () => {
  const parse = (grant) => store.storeGrantSchema.safeParse(grant).success;
  assert.equal(parse({ type: "hints", hints: 5 }), true);
  assert.equal(parse({ type: "first_class_pass", until }), true);
  assert.equal(parse({ type: "miles", miles: 100 }), true);
  assert.equal(parse({ type: "miles" }), false, "a known type without its field is off contract");
  assert.equal(parse({ type: "miles", miles: 0 }), false);
  assert.equal(parse({ type: "miles", miles: 100, extra: 1 }), false);
  assert.equal(parse({ type: "stickers", count: 3, extra: { a: 1 } }), true, "a type the website does not know yet");
  assert.equal(parse({ type: "hints" }), false, "a known type without its field is off contract");
  assert.equal(parse({ type: "hints", hints: 0 }), false);
  assert.equal(parse({ type: "hints", hints: 5, extra: 1 }), false);
  assert.equal(parse({ type: "first_class_pass" }), false);
  assert.equal(parse({ type: "first_class_pass", until: "soon" }), false);
  assert.equal(parse({ type: "" }), false);
  assert.equal(parse({ type: "x".repeat(65) }), false);
  assert.equal(parse({ hints: 5 }), false);
  assert.equal(parse("hints"), false);
  assert.equal(parse(null), false);
});

test("purchase, list, subscription and entitlements schemas", () => {
  const purchase = (value) => store.staffStorePurchaseSchema.safeParse(value).success;
  assert.equal(purchase(hintsPurchase), true);
  assert.equal(purchase(passPurchase), true);
  assert.equal(purchase({ ...hintsPurchase, kind: "miles_pack" }), true, "kind is open");
  assert.equal(purchase({ ...hintsPurchase, kind: "stickers_pack" }), true, "an unknown kind is open too");
  assert.equal(purchase({ ...hintsPurchase, kind: "" }), false);
  assert.equal(purchase({ ...hintsPurchase, environment: "staging" }), false);
  assert.equal(purchase({ ...hintsPurchase, store: "amazon" }), false);
  assert.equal(purchase({ ...hintsPurchase, extra: 1 }), false);
  assert.equal(purchase({ ...hintsPurchase, id: 0 }), false);
  assert.equal(purchase({ ...hintsPurchase, purchasedAt: "yesterday" }), false);
  assert.equal(purchase({ ...hintsPurchase, productId: "Bad Id" }), false);
  const { tokenFingerprint, ...missing } = hintsPurchase;
  assert.equal(purchase(missing), false, "nullable keys are still required");
  for (const environment of store.storeEnvironments) assert.equal(purchase({ ...hintsPurchase, environment }), true, environment);
  const page = (value) => store.staffStorePurchaseListSchema.safeParse(value).success;
  assert.equal(page({ purchases: [hintsPurchase, passPurchase], nextCursor: "abc_DEF-123" }), true);
  assert.equal(page({ purchases: [], nextCursor: null }), true);
  assert.equal(page({ purchases: [], nextCursor: "bad cursor" }), false);
  assert.equal(page({ purchases: [], nextCursor: "" }), false);
  assert.equal(page({ purchases: [] }), false);
  assert.equal(page({ purchases: [], nextCursor: null, extra: 1 }), false);
  const sub = (value) => store.staffStoreSubscriptionSchema.safeParse(value).success;
  assert.equal(sub(subscription), true);
  for (const status of store.storeSubscriptionStatuses) assert.equal(sub({ ...subscription, status }), true, status);
  assert.equal(sub({ ...subscription, status: "paused" }), false);
  assert.equal(sub({ ...subscription, extra: 1 }), false);
  const ent = (value) => store.staffEntitlementsSchema.safeParse(value).success;
  assert.equal(ent(entitlements), true);
  assert.equal(ent({ ...entitlements, firstClassPass: false, firstClassUntil: null, productId: null, subscriptions: [] }), true);
  assert.equal(ent({ ...entitlements, commerceToken: "9d3c9fb2-2d3b-4b3d-8a2f-2f6e5f9a3c11" }), false, "the commerce token is never part of the staff view");
  assert.equal(ent({ ...entitlements, subscriptions: [{ ...subscription, status: "paused" }] }), false);
  assert.equal(ent({ ...entitlements, hasStoreAccount: "yes" }), false);
});

test("search request schema: strict, optional, never empty", () => {
  const parse = (value) => store.purchaseSearchRequestSchema.safeParse(value).success;
  assert.equal(parse({}), true);
  assert.equal(parse({ player: "buyer", productId: "hints.pack_5", store: "google", transactionRef: "tok.en~1:2-3", orderId: "GPA.1:2-3", cursor: "abc_DEF-1" }), true);
  for (const bad of [
    { player: "" },
    { productId: "" },
    { productId: "Bad" },
    { store: "" },
    { store: "amazon" },
    { transactionRef: "" },
    { transactionRef: "has space" },
    { transactionRef: "a".repeat(1025) },
    { orderId: "" },
    { orderId: "a~b" },
    { orderId: "a".repeat(129) },
    { cursor: "" },
    { cursor: "a.b" },
    { cursor: "a".repeat(101) },
    { limit: 5 },
    { player: 5 },
  ])
    assert.equal(parse(bad), false, JSON.stringify(bad));
  assert.equal(parse({ transactionRef: "a".repeat(1024) }), true);
});

test("player references: uid rule, principal parsing and the caller's project", () => {
  const p = "demo-airplane-games";
  const ok = (input) => store.parsePlayerRef(input, p);
  assert.deepEqual(ok("abc123"), { ok: true, principal: `firebase:${p}:abc123` });
  assert.deepEqual(ok(`firebase:${p}:abc123`), { ok: true, principal: `firebase:${p}:abc123` });
  assert.deepEqual(ok("firebase:other-project:abc"), { ok: false, reason: "other_project" });
  for (const bad of ["", " ", " a", "a ", "a/b", "a\nb", "a\u0085b", ".", "..", "x".repeat(129), "firebase::a", `firebase:${p}:`, `firebase:${p}:a:b`, `firebase:${p}: a`, `firebase:bad_project:a`, "other:thing:a", "a:b"])
    assert.deepEqual(ok(bad), { ok: false, reason: "invalid" }, JSON.stringify(bad));
  assert.deepEqual(ok("x".repeat(128)), { ok: true, principal: `firebase:${p}:${"x".repeat(128)}` });
  assert.deepEqual(ok("a.b"), { ok: true, principal: `firebase:${p}:a.b` });
  assert.equal(store.projectOfPrincipal(`firebase:${p}:abc`), p);
  for (const bad of ["abc", "firebase:p:", "firebase:p:a:b", "firebase:p q:a", "google:p:a", `firebase:${"p".repeat(65)}:a`])
    assert.equal(store.projectOfPrincipal(bad), null, bad);
  assert.match("abc", store.storeUidPattern);
  assert.doesNotMatch("a:b", store.storeUidPattern);
  assert.doesNotMatch("a\u0007b", store.storeUidPattern);
});

// ===== Route tests =====

const { dispatch } = await import("../lib/request/router.ts");
const { routes } = await import("../lib/request/routes.ts");
const { resolvePrincipal, accountSessionKey } = await import("../lib/request/principal.ts");
const { BackendError, BackendNotConnected } = await import("../lib/request/backend.ts");
const { d1Sqlite } = await import("./support/d1-sqlite.mjs");
const { memoryEditorialStore } = await import("../lib/editorial/memory-store.ts");
const { d1ContentStore } = await import("../lib/editorial/content-d1.ts");

const project = "demo-airplane-games";
const origin = "http://site.test";
const identity = (uid, email) => ({
  userId: `firebase:${project}:${uid}`,
  email,
  fullName: null,
  emailVerified: true,
  expiresAt: 9999999999,
  authTime: 1,
});
const tokens = {
  staff: identity("editor", "editor@example.com"),
  member: identity("member", "member@example.com"),
  photographer: identity("lens", "lens@example.com"),
  demo: identity("demo-uid", "demo@example.com"),
};
const roleRow = (role) => ({ role, state: "active", revision: 1, requestedAt: "2026-11-01T00:00:00.000Z", decidedAt: null });
const roleMap = {
  staff: [roleRow("player"), roleRow("admin")],
  member: [roleRow("player")],
  photographer: [roleRow("player"), roleRow("photographer")],
};

function fakeBackend(reply) {
  const calls = [];
  return {
    calls,
    as(bearer) {
      const run = async (method, path, body) => {
        const call = { method, path, body, token: bearer.reveal() };
        calls.push(call);
        return reply(call);
      };
      return {
        getJson: (path) => run("GET", path),
        send: (method, path, body) => run(method, path, body),
        sendWithStatus: async (method, path, body) => ({ status: 200, body: await run(method, path, body) }),
      };
    },
  };
}

const page = { purchases: [hintsPurchase, passPurchase], nextCursor: null };

function harness({ roles = "backend", reply = () => page } = {}) {
  const backend = fakeBackend((call) => reply(call));
  const db = d1Sqlite();
  const editorial = memoryEditorialStore();
  const handle = dispatch(routes, {
    principal: (request) =>
      resolvePrincipal(request.headers, {
        verifier: {
          async verify(token) {
            return tokens[token] ?? null;
          },
        },
        cookieName: "aa_session",
        roles: async (bearer) =>
          roles === "mock"
            ? { status: "ok", roles: roleMap[bearer.reveal()] ?? [], source: "mock" }
            : roles === "down"
              ? { status: "unavailable" }
              : roles === "not-connected"
                ? { status: "not-connected" }
                : { status: "ok", roles: roleMap[bearer.reveal()] ?? [] },
        projectId: project,
        demoUid: "demo-uid",
      }),
    db: () => db,
    photos: () => {
      throw new Error("photo storage is not used in these tests");
    },
    editorial: () => editorial,
    content: () => d1ContentStore(db),
    references: async () => ({ airports: [] }),
    backend: (bearer) => backend.as(bearer),
  });
  /** Segments are decoded once, as the framework delivers them to the router. */
  async function call(method, path, { as = "staff", body, headers = {}, from = origin } = {}) {
    const init = { method, headers: { origin: from, cookie: `aa_session=${as}`, ...headers } };
    if (body instanceof Uint8Array || typeof body === "string") init.body = body;
    else if (body !== undefined) init.body = JSON.stringify(body);
    if (body !== undefined) init.headers["Content-Type"] = "application/json";
    const segments = path.split("?")[0].split("/").map((part) => decodeURIComponent(part));
    const response = await handle(new Request(`${origin}/api/${path}`, init), segments);
    return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
  }
  return { call, backend };
}

const search = "admin/store/purchases/search";
const buyer = `firebase:${project}:buyer`;
const players = (principal) => `admin/store/players/${encodeURIComponent(principal)}/entitlements`;
const viewCalls = [
  ["POST", search, { body: {} }],
  ["GET", players(buyer), {}],
];
const fail = (status, code = "", retryAfter) => () => {
  throw new BackendError(status, code, retryAfter);
};
const entitlementsReply = () => entitlements;

test("on a mock deployment both routes are 404 STORE_UNAVAILABLE and the backend is never called", async () => {
  const { call, backend } = harness({ roles: "mock" });
  for (const [method, path, opts] of viewCalls) {
    const res = await call(method, path, opts);
    assert.deepEqual([res.status, res.body.code], [404, "STORE_UNAVAILABLE"], `${method} ${path}`);
  }
  assert.equal(backend.calls.length, 0);
});

test("router order comes first: guest 401, demo 403, member 403, fence 409, origin 403", async () => {
  const { call, backend } = harness();
  for (const [method, path, opts] of viewCalls) {
    assert.equal((await call(method, path, { ...opts, as: "nobody" })).status, 401, `guest ${path}`);
    const demo = await call(method, path, { ...opts, as: "demo" });
    assert.deepEqual([demo.status, demo.body.code], [403, "DEMO_ACCOUNT"], `${method} ${path}`);
    for (const as of ["member", "photographer"])
      assert.equal((await call(method, path, { ...opts, as })).status, 403, `${as} ${method} ${path}`);
    const fenced = await call(method, path, { ...opts, headers: { "X-Account-Session": "someone-else" } });
    assert.deepEqual([fenced.status, fenced.body.code], [409, "ACCOUNT_CHANGED"], `${method} ${path}`);
  }
  assert.equal((await call("POST", search, { body: {}, from: "https://elsewhere.test" })).status, 403, "search is a mutation-class route: same-origin only");
  assert.equal(backend.calls.length, 0);
  const session = await accountSessionKey(tokens.staff.userId);
  const fine = harness();
  assert.equal((await fine.call("POST", search, { body: {}, headers: { "X-Account-Session": session } })).status, 200);
});

test("no backend and unreadable roles are 503 with no backend call", async () => {
  for (const roles of ["not-connected", "down"]) {
    const { call, backend } = harness({ roles });
    for (const [method, path, opts] of viewCalls) {
      const res = await call(method, path, opts);
      assert.equal(res.status, 503, `${roles} ${method} ${path}`);
      assert.equal(res.body.code, "ROLES_UNAVAILABLE", roles);
    }
    assert.equal(backend.calls.length, 0);
  }
  const { call } = harness({ reply: () => { throw new BackendNotConnected(); } });
  for (const [method, path, opts] of viewCalls) {
    const res = await call(method, path, opts);
    assert.deepEqual([res.status, res.body.code], [503, "BACKEND_NOT_CONNECTED"], `${method} ${path}`);
  }
});

test("search with no filters asks for limit=50 and passes the page on", async () => {
  const { call, backend } = harness();
  const res = await call("POST", search, { body: {} });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, page);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(backend.calls.map((c) => [c.method, c.path, c.token, c.body]), [["GET", "/v1/admin/store/purchases?limit=50", "staff", undefined]]);
});

test("search builds the exact backend query string, in a fixed order", async () => {
  const { call, backend } = harness();
  const body = {
    cursor: "abc_DEF-1",
    orderId: "GPA.1234:5",
    transactionRef: "tok.en~1:2-3",
    store: "google",
    productId: "hints.pack_5",
    player: "buyer",
  };
  assert.equal((await call("POST", search, { body })).status, 200);
  assert.equal(
    backend.calls[0].path,
    `/v1/admin/store/purchases?player=firebase%3Ademo-airplane-games%3Abuyer&productId=hints.pack_5&store=google&transactionRef=tok.en%7E1%3A2-3&orderId=GPA.1234%3A5&cursor=abc_DEF-1&limit=50`,
  );
  await call("POST", search, { body: { store: "apple" } });
  assert.equal(backend.calls[1].path, "/v1/admin/store/purchases?store=apple&limit=50");
});

test("a bare uid becomes the caller's project principal; a full principal of that project is kept", async () => {
  const { call, backend } = harness();
  await call("POST", search, { body: { player: "someUid" } });
  await call("POST", search, { body: { player: `firebase:${project}:otherUid` } });
  assert.deepEqual(
    backend.calls.map((c) => new URL(`http://x${c.path}`).searchParams.get("player")),
    [`firebase:${project}:someUid`, `firebase:${project}:otherUid`],
  );
});

test("another project's principal and malformed players are 400 with no backend call", async () => {
  const { call, backend } = harness();
  const other = await call("POST", search, { body: { player: "firebase:some-other-project:uid" } });
  assert.deepEqual([other.status, other.body.code, other.body.error], [400, "INVALID_REQUEST", "That id belongs to another Firebase project."]);
  for (const player of [" uid", "uid ", "a/b", "a\nb", ".", "..", "firebase:bad_project:uid", `firebase:${project}:`, `firebase:${project}:a:b`, "a:b", "x".repeat(129)]) {
    const res = await call("POST", search, { body: { player } });
    assert.deepEqual([res.status, res.body.code], [400, "INVALID_REQUEST"], JSON.stringify(player));
  }
  assert.equal(backend.calls.length, 0);
});

test("search body is strict: bad shapes, empty values and extra keys are 400 with no backend call", async () => {
  const { call, backend } = harness();
  const bodies = [
    undefined,
    "not json",
    "[]",
    "null",
    "5",
    { extra: 1 },
    { limit: 10 },
    { player: "" },
    { productId: "" },
    { productId: "Bad Id" },
    { store: "" },
    { store: "amazon" },
    { transactionRef: "" },
    { transactionRef: "has space" },
    { transactionRef: "a/b" },
    { transactionRef: "a".repeat(1025) },
    { orderId: "" },
    { orderId: "a~b" },
    { cursor: "" },
    { cursor: "a.b" },
    { cursor: "a".repeat(101) },
    { player: 5 },
    { store: ["apple"] },
  ];
  for (const body of bodies) {
    const res = await call("POST", search, { body });
    assert.deepEqual([res.status, res.body.code], [400, "INVALID_REQUEST"], JSON.stringify(body));
  }
  const bytes = await call("POST", search, { body: new Uint8Array([0xff, 0xfe, 0x7b]) });
  assert.equal(bytes.status, 400, "invalid UTF-8");
  assert.equal(backend.calls.length, 0);
  // The longest accepted values still go through.
  const ok = await call("POST", search, { body: { transactionRef: "a".repeat(1024), orderId: "o".repeat(128), productId: "a".repeat(100) } });
  assert.equal(ok.status, 200);
});

test("search takes no query parameter on the website URL, and a body over 4 KB is 413", async () => {
  const { call, backend } = harness();
  const withQuery = await call("POST", `${search}?transactionRef=secret`, { body: {} });
  assert.deepEqual([withQuery.status, withQuery.body.code], [400, "INVALID_REQUEST"]);
  const big = await call("POST", search, { body: JSON.stringify({ transactionRef: "a".repeat(5000) }) });
  assert.deepEqual([big.status, big.body.code], [413, "TOO_LARGE"]);
  assert.equal(backend.calls.length, 0);
});

test("a miles grant and an unknown grant type pass through; a known type without its field is 502", async () => {
  const miles = { ...hintsPurchase, id: 9, kind: "miles_pack", grant: { type: "miles", miles: 250 } };
  const sticker = { ...hintsPurchase, id: 10, kind: "sticker_pack", grant: { type: "stickers", count: 3, note: { a: 1 } } };
  const { call } = harness({ reply: () => ({ purchases: [miles, hintsPurchase], nextCursor: "next_1" }) });
  const res = await call("POST", search, { body: {} });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.purchases[0].grant, miles.grant);
  assert.equal(res.body.purchases[0].kind, "miles_pack");
  assert.equal(res.body.nextCursor, "next_1");
  const other = harness({ reply: () => ({ purchases: [sticker], nextCursor: null }) });
  const shown = await other.call("POST", search, { body: {} });
  assert.equal(shown.status, 200);
  assert.deepEqual(shown.body.purchases[0].grant, sticker.grant);
  for (const grant of [{ type: "hints" }, { type: "miles" }, { type: "miles", miles: 0 }, { type: "first_class_pass" }, { type: "hints", hints: 5, extra: 1 }, { type: "" }, "hints", null]) {
    const bad = harness({ reply: () => ({ purchases: [{ ...hintsPurchase, grant }], nextCursor: null }) });
    const off = await bad.call("POST", search, { body: {} });
    assert.deepEqual([off.status, off.body.code], [502, "BACKEND_CONTRACT"], JSON.stringify(grant));
  }
});

test("off-contract search answers are 502 BACKEND_CONTRACT", async () => {
  for (const answer of [
    { purchases: [{ ...hintsPurchase, extra: 1 }], nextCursor: null },
    { purchases: [{ ...hintsPurchase, environment: "staging" }], nextCursor: null },
    { purchases: [{ ...hintsPurchase, store: "amazon" }], nextCursor: null },
    { purchases: [], nextCursor: "bad cursor" },
    { purchases: [] },
    { items: [] },
    { purchases: [], nextCursor: null, extra: 1 },
    null,
  ]) {
    const { call } = harness({ reply: () => answer });
    const res = await call("POST", search, { body: {} });
    assert.deepEqual([res.status, res.body.code], [502, "BACKEND_CONTRACT"], JSON.stringify(answer));
  }
});

test("CURSOR_STALE only when a cursor was sent; otherwise 400 is INVALID_REQUEST", async () => {
  const { call, backend } = harness({ reply: fail(400, "invalid_request") });
  const stale = await call("POST", search, { body: { cursor: "abc" } });
  assert.deepEqual([stale.status, stale.body.code], [400, "CURSOR_STALE"]);
  assert.equal(stale.body.error, "That page no longer matches this search. Start again from the first page.");
  const first = await call("POST", search, { body: { productId: "hints.pack_5" } });
  assert.deepEqual([first.status, first.body.code], [400, "INVALID_REQUEST"]);
  assert.equal(backend.calls.length, 2, "never retried");
});

test("search backend failures map to website codes, never retried", async () => {
  const cases = [
    [401, "", 401, "SIGNED_OUT"],
    [403, "forbidden", 403, "FORBIDDEN"],
    [404, "not_found", 502, "BACKEND_CONTRACT"],
    [404, "player_not_found", 502, "BACKEND_CONTRACT"],
    [413, "", 502, "BACKEND_CONTRACT"],
    [422, "x", 502, "BACKEND_CONTRACT"],
    [500, "", 503, "BACKEND_UNAVAILABLE"],
    [503, "", 503, "BACKEND_UNAVAILABLE"],
    [0, "unreachable", 503, "BACKEND_UNAVAILABLE"],
  ];
  for (const [status, code, wantStatus, wantCode] of cases) {
    const { call, backend } = harness({ reply: fail(status, code) });
    const res = await call("POST", search, { body: {} });
    assert.deepEqual([res.status, res.body.code], [wantStatus, wantCode], `${status} ${code}`);
    assert.equal(backend.calls.length, 1, "one attempt only");
  }
  const limited = await harness({ reply: fail(429, "rate_limited", 2.2) }).call("POST", search, { body: {} });
  assert.deepEqual([limited.status, limited.body.code, limited.body.retryAfter], [429, "RATE_LIMITED", 3]);
  assert.equal(limited.headers.get("retry-after"), "3");
  const none = await harness({ reply: fail(429, "rate_limited") }).call("POST", search, { body: {} });
  assert.equal(none.headers.get("retry-after"), null);
});

test("no secret value is echoed in an error body", async () => {
  const secret = "SECRET-purchase-token-123";
  const { call } = harness({ reply: fail(400, "invalid_request") });
  const res = await call("POST", search, { body: { transactionRef: secret, cursor: "cur" } });
  assert.ok(!JSON.stringify(res.body).includes(secret));
  const bad = await call("POST", search, { body: { transactionRef: `${secret} x` } });
  assert.ok(!JSON.stringify(bad.body).includes(secret));
});

test("entitlements: exact backend path, token, and answer", async () => {
  const { call, backend } = harness({ reply: entitlementsReply });
  const res = await call("GET", players(buyer));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, entitlements);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(backend.calls.map((c) => [c.method, c.path, c.token]), [
    ["GET", `/v1/admin/store/players/firebase%3Ademo-airplane-games%3Abuyer/entitlements`, "staff"],
  ]);
});

test("entitlements: a %3A path segment is decoded once by the framework, validated, and encoded once", async () => {
  const { call, backend } = harness({ reply: entitlementsReply });
  // The client sends encodeURIComponent(principal); the router receives the decoded segment.
  assert.ok(players(buyer).includes("%3A"));
  assert.equal((await call("GET", players(buyer))).status, 200);
  // A bare uid becomes the caller's project principal.
  assert.equal((await call("GET", "admin/store/players/buyer/entitlements")).status, 200);
  assert.equal((await call("GET", players("odd.uid~1"))).status, 200);
  assert.deepEqual(backend.calls.map((c) => c.path), [
    "/v1/admin/store/players/firebase%3Ademo-airplane-games%3Abuyer/entitlements",
    "/v1/admin/store/players/firebase%3Ademo-airplane-games%3Abuyer/entitlements",
    "/v1/admin/store/players/firebase%3Ademo-airplane-games%3Aodd.uid~1/entitlements",
  ]);
  // Never decoded twice: a double-encoded colon is just characters of a bare uid, and is encoded again once.
  assert.equal((await call("GET", `admin/store/players/${encodeURIComponent("a%3Ab")}/entitlements`)).status, 200);
  assert.equal(backend.calls[3].path, "/v1/admin/store/players/firebase%3Ademo-airplane-games%3Aa%253Ab/entitlements");
});

test("entitlements: another project's principal and bad ids are 400 with no backend call", async () => {
  const { call, backend } = harness({ reply: entitlementsReply });
  const other = await call("GET", players("firebase:other-project:buyer"));
  assert.deepEqual([other.status, other.body.code, other.body.error], [400, "INVALID_REQUEST", "That id belongs to another Firebase project."]);
  for (const id of [" buyer", "buyer ", ".", "..", "a\nb", "a:b", `firebase:${project}:`, `firebase:${project}:a:b`, "firebase:bad_project:x", "x".repeat(129)]) {
    const res = await call("GET", players(id));
    assert.deepEqual([res.status, res.body.code], [400, "INVALID_REQUEST"], JSON.stringify(id));
  }
  // A slash inside the segment arrives as one decoded segment containing "/"; it never forms a backend path.
  const slash = await call("GET", `admin/store/players/${encodeURIComponent("a/b")}/entitlements`);
  assert.deepEqual([slash.status, slash.body.code], [400, "INVALID_REQUEST"]);
  const query = await call("GET", `${players(buyer)}?x=1`);
  assert.deepEqual([query.status, query.body.code], [400, "INVALID_REQUEST"]);
  assert.equal(backend.calls.length, 0);
});

test("entitlements: 404 player_not_found is PLAYER_NOT_FOUND; other failures map as for search", async () => {
  const missing = await harness({ reply: fail(404, "player_not_found") }).call("GET", players(buyer));
  assert.deepEqual([missing.status, missing.body.code], [404, "PLAYER_NOT_FOUND"]);
  assert.equal(missing.body.error, "No player with that id (or the account was deleted).");
  const other404 = await harness({ reply: fail(404, "not_found") }).call("GET", players(buyer));
  assert.deepEqual([other404.status, other404.body.code], [502, "BACKEND_CONTRACT"], "a 404 without the code is a missing route, not a missing player");
  const cases = [
    [400, "invalid_request", 400, "INVALID_REQUEST"],
    [401, "", 401, "SIGNED_OUT"],
    [403, "forbidden", 403, "FORBIDDEN"],
    [500, "", 503, "BACKEND_UNAVAILABLE"],
    [0, "unreachable", 503, "BACKEND_UNAVAILABLE"],
  ];
  for (const [status, code, wantStatus, wantCode] of cases) {
    const { call, backend } = harness({ reply: fail(status, code) });
    const res = await call("GET", players(buyer));
    assert.deepEqual([res.status, res.body.code], [wantStatus, wantCode], `${status} ${code}`);
    assert.equal(backend.calls.length, 1);
  }
  const limited = await harness({ reply: fail(429, "rate_limited", 1) }).call("GET", players(buyer));
  assert.deepEqual([limited.status, limited.body.code, limited.headers.get("retry-after")], [429, "RATE_LIMITED", "1"]);
});

test("off-contract entitlements answers are 502 BACKEND_CONTRACT", async () => {
  for (const answer of [
    { ...entitlements, extra: 1 },
    { ...entitlements, commerceToken: "9d3c9fb2-2d3b-4b3d-8a2f-2f6e5f9a3c11" },
    { ...entitlements, subscriptions: [{ ...subscription, status: "paused" }] },
    { ...entitlements, subscriptions: [{ ...subscription, store: "amazon" }] },
    { ...entitlements, hasStoreAccount: undefined },
    { ...entitlements, firstClassUntil: "soon" },
    page,
    null,
  ]) {
    const { call } = harness({ reply: () => answer });
    const res = await call("GET", players(buyer));
    assert.deepEqual([res.status, res.body.code], [502, "BACKEND_CONTRACT"], JSON.stringify(answer));
  }
});
