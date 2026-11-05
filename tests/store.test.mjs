import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// ===== Contract tests =====

const store = await import("../lib/request/store.ts");
const yaml = await readFile(new URL("../contracts/openapi.yaml", import.meta.url), "utf8");

// The schema block under components/schemas: from "    Name:" to the next 4-space key.
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

const created = "2026-11-04T10:00:00.000Z";
const pack = {
  productId: "hints.pack_5",
  kind: "hint_pack",
  hints: 5,
  miles: null,
  passPeriod: null,
  title: "Five hints",
  demo: false,
  status: "active",
  version: 1,
  createdAt: created,
  updatedAt: created,
};
const milesPack = { ...pack, productId: "miles.pack_5000", kind: "miles_pack", hints: null, miles: 5000, title: "Five thousand Miles" };
const pass = { ...pack, productId: "pass.monthly", kind: "first_class_pass", hints: null, passPeriod: "P1M", title: "Monthly pass" };

test("store schemas list the contract's keys, enums and id pattern", () => {
  assert.deepEqual(list(block("StoreProductKind"), "enum", 6), [...store.storeProductKinds].sort());
  assert.deepEqual(list(block("StorePassPeriod"), "enum", 6), [...store.storePassPeriods].sort());
  assert.deepEqual(list(block("StoreProductStatus"), "enum", 6), [...store.storeProductStatuses].sort());
  const productBlock = block("AdminStoreProduct");
  assert.deepEqual(propertyNames(productBlock).sort(), keys(store.adminStoreProductSchema));
  // hints, miles and passPeriod are properties but not required.
  assert.deepEqual([...list(productBlock, "required"), "hints", "miles", "passPeriod"].sort(), keys(store.adminStoreProductSchema));
  assert.deepEqual(list(block("AdminStoreProductList"), "required"), keys(store.adminStoreProductListSchema));
  const requestBlock = block("AdminStoreProductRequest");
  assert.deepEqual(list(requestBlock, "required"), ["demo", "kind", "title"]);
  assert.deepEqual(propertyNames(requestBlock).sort(), ["demo", "hints", "kind", "miles", "passPeriod", "title", "version"]);
  assert.deepEqual(list(block("StoreProductVersionRequest"), "required"), keys(store.storeVersionRequestSchema));
  assert.ok(block("StoreProductId").includes(`pattern: "${store.storeProductIdPattern.source}"`));
  assert.ok(requestBlock.includes("maxLength: 100") && requestBlock.includes("maximum: 1000") && requestBlock.includes("maximum: 2147483647"));
  assert.equal(store.storeTitleMax, 100);
  assert.deepEqual([store.storeHintsMin, store.storeHintsMax], [1, 1000]);
  assert.deepEqual([store.storeMilesMin, store.storeMilesMax], [1, 1000000]);
  assert.ok(requestBlock.includes("maximum: 1000000"));
  assert.deepEqual(store.storeProductKinds, ["hint_pack", "miles_pack", "first_class_pass"]);
  for (const path of [
    "/v1/admin/store/products:",
    "/v1/admin/store/products/{productId}:",
    "/v1/admin/store/products/{productId}/retire:",
    "/v1/admin/store/products/{productId}/restore:",
  ])
    assert.ok(yaml.includes(`\n  ${path}\n`), path);
});

test("AdminStoreProduct accepts the contract's shapes and refuses everything else", () => {
  const parse = (value) => store.adminStoreProductSchema.safeParse(value).success;
  assert.equal(parse(pack), true);
  assert.equal(parse(pass), true);
  assert.equal(parse(milesPack), true);
  assert.equal(parse({ ...milesPack, miles: 0 }), false);
  assert.equal(parse({ ...milesPack, miles: 1000001 }), false);
  assert.equal(parse({ ...milesPack, miles: 1.5 }), false);
  const { hints, miles, passPeriod, ...bare } = pack;
  assert.equal(parse(bare), true, "hints, miles and passPeriod may be absent");
  assert.equal(parse({ ...pack, extra: 1 }), false);
  assert.equal(parse({ ...pack, kind: "coins" }), false);
  assert.equal(parse({ ...pack, status: "deleted" }), false);
  assert.equal(parse({ ...pack, productId: "Bad Id" }), false);
  assert.equal(parse({ ...pack, hints: 1001 }), false);
  assert.equal(parse({ ...pack, version: 0 }), false);
  assert.equal(parse({ ...pack, title: "" }), false);
  assert.equal(parse({ ...pack, title: "x".repeat(101) }), false);
  assert.equal(parse({ ...pack, title: "\u{1F680}".repeat(100) }), true, "100 code points (200 UTF-16 units) is valid");
  assert.equal(parse({ ...pack, title: "\u{1F680}".repeat(101) }), false);
  assert.equal(parse({ ...pack, createdAt: "yesterday" }), false);
  assert.equal(store.adminStoreProductListSchema.safeParse({ products: [pack, pass] }).success, true);
  assert.equal(store.adminStoreProductListSchema.safeParse({ products: [pack], extra: 1 }).success, false);
  assert.equal(parse({ ...pack, title: "Odd\ttitle\u0000" }), true, "a stored odd title still parses");
  assert.equal(parse({ ...pack, title: "Legacy\u0085row\n" }), true, "a legacy row with control characters still lists");
});

test("product id pattern", () => {
  for (const ok of ["a", "0", "hints.pack_5", "a".repeat(100)]) assert.match(ok, store.storeProductIdPattern, ok);
  for (const bad of ["", ".a", "_a", "A", "a b", "a-b", "a/b", "a".repeat(101), "a\n"])
    assert.doesNotMatch(bad, store.storeProductIdPattern, JSON.stringify(bad));
});

test("StoreProductRequest: strict keys, kind rules, title and version limits", () => {
  const parse = (value) => store.storeProductRequestSchema.safeParse(value).success;
  const create = { kind: "hint_pack", title: "Five hints", hints: 5, demo: false };
  assert.equal(parse(create), true);
  assert.equal(parse({ ...create, version: 2 }), true);
  assert.equal(parse({ kind: "first_class_pass", title: "Pass", passPeriod: "P1Y", demo: false }), true);
  assert.equal(parse({ ...create, extra: 1 }), false);
  assert.equal(parse({ ...create, hints: undefined }), false, "a hint pack needs hints");
  assert.equal(parse({ ...create, passPeriod: "P1M" }), false, "a hint pack takes no period");
  assert.equal(parse({ kind: "first_class_pass", title: "Pass", demo: false }), false, "a pass needs a period");
  assert.equal(parse({ kind: "first_class_pass", title: "Pass", passPeriod: "P1M", hints: 5, demo: false }), false);
  assert.equal(parse({ ...create, hints: 0 }), false);
  assert.equal(parse({ ...create, hints: 1000 }), true);
  assert.equal(parse({ ...create, hints: 1001 }), false);
  assert.equal(parse({ ...create, hints: 1.5 }), false);
  assert.equal(parse({ ...create, passPeriod: "P2M", hints: undefined }), false);
  const milesCreate = { kind: "miles_pack", title: "Miles", miles: 5000, demo: false };
  assert.equal(parse(milesCreate), true);
  assert.equal(parse({ ...milesCreate, version: 2 }), true);
  assert.equal(parse({ ...milesCreate, miles: undefined }), false, "a Miles pack needs miles");
  assert.equal(parse({ ...milesCreate, hints: 5 }), false, "a Miles pack takes no hints");
  assert.equal(parse({ ...milesCreate, passPeriod: "P1M" }), false, "a Miles pack takes no period");
  assert.equal(parse({ ...create, miles: 5000 }), false, "a hint pack takes no miles");
  assert.equal(parse({ kind: "first_class_pass", title: "Pass", passPeriod: "P1M", miles: 5000, demo: false }), false);
  assert.equal(parse({ ...milesCreate, miles: 0 }), false);
  assert.equal(parse({ ...milesCreate, miles: 1 }), true);
  assert.equal(parse({ ...milesCreate, miles: 1000000 }), true);
  assert.equal(parse({ ...milesCreate, miles: 1000001 }), false);
  assert.equal(parse({ ...milesCreate, miles: 2.5 }), false);
  assert.equal(parse({ ...create, demo: "no" }), false);
  assert.equal(parse({ kind: "hint_pack", title: "x", hints: 5 }), false, "demo is required");
  assert.equal(parse({ ...create, version: 0 }), false);
  assert.equal(parse({ ...create, version: 2147483647 }), true);
  assert.equal(parse({ ...create, version: 2147483648 }), false);
  assert.equal(parse({ ...create, version: 1.5 }), false);
  assert.equal(parse({ ...create, title: "" }), false);
  for (const title of ["a\nb", "a\tb", "a\u0000b", "a\u007fb", "a\u0080b", "a\u0085b", "a\u009fb", "   ", "\n"]) assert.equal(parse({ ...create, title }), false, JSON.stringify(title));
});

test("title length counts code points and trims first, as the backend does", () => {
  const parse = (title) => store.storeProductRequestSchema.safeParse({ kind: "hint_pack", title, hints: 5, demo: false }).success;
  assert.equal(parse("x".repeat(100)), true);
  assert.equal(parse("x".repeat(101)), false);
  // 100 emoji are 200 UTF-16 units but 100 code points.
  assert.equal(parse("\u{1F680}".repeat(100)), true);
  assert.equal(parse("\u{1F680}".repeat(101)), false);
  assert.equal(parse(`  ${"x".repeat(100)}  `), true, "length is checked after trimming");
  assert.equal(store.codePointLength("a\u{1F680}"), 2);
  assert.equal(store.hasControlCharacter("a\nb"), true);
  assert.equal(store.hasControlCharacter("a b"), false);
  for (const c of ["\u0000", "\u001f", "\u007f", "\u0080", "\u0085", "\u009f"]) assert.equal(store.hasControlCharacter(c), true, JSON.stringify(c));
  for (const c of ["\u00a0", "\u00e9", "\u2028"]) assert.equal(store.hasControlCharacter(c), false, JSON.stringify(c));
});

test("website error codes equal their keys", () => {
  for (const [key, value] of Object.entries(store.storeErrorCodes)) assert.equal(key, value);
  for (const code of [
    "STORE_UNAVAILABLE",
    "BACKEND_NOT_CONNECTED",
    "ROLES_UNAVAILABLE",
    "BACKEND_UNAVAILABLE",
    "BACKEND_CONTRACT",
    "FORBIDDEN",
    "SIGNED_OUT",
    "INVALID_REQUEST",
    "NOT_FOUND",
    "VERSION_CONFLICT",
    "PRODUCT_EXISTS",
    "CONTENT_INVALID",
    "TOO_LARGE",
    "RATE_LIMITED",
    "CURSOR_STALE",
    "PLAYER_NOT_FOUND",
  ])
    assert.ok(store.storeErrorCodes[code], code);
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
      const run = async (method, path, body, contentType, options) => {
        const call = { method, path, body, contentType, options, token: bearer.reveal() };
        calls.push(call);
        return reply(call);
      };
      return {
        getJson: (path) => run("GET", path),
        send: (method, path, body, contentType, options) => run(method, path, body, contentType, options),
        sendWithStatus: async (method, path, body, contentType, options) => {
          const answer = await run(method, path, body, contentType, options);
          return answer && answer.__status ? { status: answer.__status, body: answer.body } : { status: 201, body: answer };
        },
      };
    },
  };
}

/** `roles`: "backend" (the role map), "mock", "down" or "not-connected". */
function harness({ roles = "backend", reply = () => pack } = {}) {
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
  /** `body`: an object (JSON), a string (raw text) or a Uint8Array (raw). */
  async function call(method, path, { as = "staff", body, headers = {}, from = origin } = {}) {
    const init = { method, headers: { origin: from, cookie: `aa_session=${as}`, ...headers } };
    if (body instanceof Uint8Array || typeof body === "string") init.body = body;
    else if (body !== undefined) init.body = JSON.stringify(body);
    if (body !== undefined) init.headers["Content-Type"] = "application/json";
    const response = await handle(new Request(`${origin}/api/${path}`, init), path.split("?")[0].split("/"));
    return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
  }
  return { call, backend };
}

const base = "admin/store/products";
const edit = { version: 1, kind: "hint_pack", title: "Five hints", hints: 5, demo: false };
const create = { kind: "hint_pack", title: "Five hints", hints: 5, demo: false };
const storeCalls = [
  ["GET", base, {}],
  ["PUT", `${base}/hints.pack_5`, { body: edit }],
  ["POST", `${base}/hints.pack_5/retire`, { body: { version: 1 } }],
  ["POST", `${base}/hints.pack_5/restore`, { body: { version: 1 } }],
];
const fail = (status, code = "", retryAfter) => () => {
  throw new BackendError(status, code, retryAfter);
};

test("on a mock deployment every store route is 404 STORE_UNAVAILABLE and the backend is never called", async () => {
  const { call, backend } = harness({ roles: "mock" });
  for (const [method, path, opts] of storeCalls) {
    const res = await call(method, path, opts);
    assert.deepEqual([res.status, res.body.code], [404, "STORE_UNAVAILABLE"], `${method} ${path}`);
  }
  assert.equal(backend.calls.length, 0);
});

test("router order comes first: guest 401, demo 403, member 403, fence 409, origin 403", async () => {
  const { call, backend } = harness();
  assert.equal((await call("GET", base, { as: "nobody" })).status, 401);
  for (const [method, path, opts] of storeCalls) {
    const demo = await call(method, path, { ...opts, as: "demo" });
    assert.deepEqual([demo.status, demo.body.code], [403, "DEMO_ACCOUNT"], `${method} ${path}`);
    for (const as of ["member", "photographer"])
      assert.equal((await call(method, path, { ...opts, as })).status, 403, `${as} ${method} ${path}`);
    const fenced = await call(method, path, { ...opts, headers: { "X-Account-Session": "someone-else" } });
    assert.deepEqual([fenced.status, fenced.body.code], [409, "ACCOUNT_CHANGED"], `${method} ${path}`);
    if (method !== "GET") assert.equal((await call(method, path, { ...opts, from: "https://elsewhere.test" })).status, 403);
  }
  assert.equal(backend.calls.length, 0);
  const session = await accountSessionKey(tokens.staff.userId);
  const fine = harness({ reply: () => ({ products: [] }) });
  assert.equal((await fine.call("GET", base, { headers: { "X-Account-Session": session } })).status, 200);
});

test("no backend and unreadable roles are 503 and the backend is never called", async () => {
  for (const roles of ["not-connected", "down"]) {
    const { call, backend } = harness({ roles });
    for (const [method, path, opts] of storeCalls) {
      const res = await call(method, path, opts);
      assert.equal(res.status, 503, `${roles} ${method} ${path}`);
      assert.equal(res.body.code, "ROLES_UNAVAILABLE");
    }
    assert.equal(backend.calls.length, 0);
  }
  // A backend that is not configured at call time maps to BACKEND_NOT_CONNECTED.
  const { call } = harness({ reply: () => { throw new BackendNotConnected(); } });
  for (const [method, path, opts] of storeCalls) {
    const res = await call(method, path, opts);
    assert.deepEqual([res.status, res.body.code], [503, "BACKEND_NOT_CONNECTED"], `${method} ${path}`);
  }
});

test("list forwards the staff token to the exact path and passes the answer on", async () => {
  const { call, backend } = harness({ reply: () => ({ products: [pack, pass] }) });
  const res = await call("GET", base);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { products: [pack, pass] });
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(backend.calls.map((c) => [c.method, c.path, c.token]), [["GET", "/v1/admin/store/products", "staff"]]);
});

test("a stored odd title parses in the list, while the same title is refused in a request", async () => {
  const odd = { ...pack, title: "Odd\ttitle\u0000" };
  const emoji = { ...pack, productId: "hints.emoji", title: "\u{1F680}".repeat(60) };
  const { call, backend } = harness({ reply: () => ({ products: [odd, emoji] }) });
  const res = await call("GET", base);
  assert.equal(res.status, 200);
  assert.equal(res.body.products[0].title, odd.title);
  assert.equal(res.body.products[1].title, emoji.title, "60 emoji (120 units) is a valid stored title");
  const refused = await call("PUT", `${base}/hints.pack_5`, { body: { ...edit, title: odd.title } });
  assert.deepEqual([refused.status, refused.body.code], [400, "INVALID_REQUEST"]);
  assert.equal(backend.calls.length, 1, "only the list reached the backend");
});

test("any query parameter is 400 and nothing is sent", async () => {
  const { call, backend } = harness();
  for (const [method, path, opts] of storeCalls) {
    const res = await call(method, `${path}?limit=1`, opts);
    assert.deepEqual([res.status, res.body.code], [400, "INVALID_REQUEST"], `${method} ${path}`);
  }
  assert.equal(backend.calls.length, 0);
});

test("malformed id: PUT is 400, retire and restore are 404, and no path is formed", async () => {
  const { call, backend } = harness();
  for (const id of ["Bad", ".dot", "a-b", "a".repeat(101), "a%2Fb", "a%20b"]) {
    const put = await call("PUT", `${base}/${id}`, { body: edit });
    assert.deepEqual([put.status, put.body.code], [400, "INVALID_REQUEST"], id);
    for (const action of ["retire", "restore"]) {
      const res = await call("POST", `${base}/${id}/${action}`, { body: { version: 1 } });
      assert.deepEqual([res.status, res.body.code], [404, "NOT_FOUND"], `${action} ${id}`);
    }
  }
  assert.equal(backend.calls.length, 0);
});

test("PUT body validation refuses bad bodies before any backend call", async () => {
  const { call, backend } = harness();
  const bodies = [
    undefined,
    "not json",
    "[]",
    "null",
    {},
    { ...edit, extra: 1 },
    { ...edit, kind: "coins" },
    { ...edit, hints: undefined },
    { ...edit, hints: 0 },
    { ...edit, hints: 1001 },
    { ...edit, passPeriod: "P1M" },
    { version: 1, kind: "first_class_pass", title: "Pass", demo: false },
    { ...edit, title: "" },
    { ...edit, title: "x".repeat(101) },
    { ...edit, title: "line\nbreak" },
    { ...edit, title: "tab\there" },
    { ...edit, title: "c1\u0085here" },
    { ...edit, version: 0 },
    { ...edit, version: 2147483648 },
    { ...edit, version: "1" },
    { ...edit, demo: undefined },
  ];
  for (const body of bodies) {
    const res = await call("PUT", `${base}/hints.pack_5`, { body });
    assert.deepEqual([res.status, res.body.code], [400, "INVALID_REQUEST"], JSON.stringify(body));
  }
  const bytes = await call("PUT", `${base}/hints.pack_5`, { body: new Uint8Array([0xff, 0xfe, 0x7b]) });
  assert.equal(bytes.status, 400, "invalid UTF-8");
  assert.equal(backend.calls.length, 0);
});

test("PUT length is counted in code points", async () => {
  const { call, backend } = harness({ reply: () => ({ __status: 200, body: pack }) });
  const rocket = "\u{1F680}";
  const over = await call("PUT", `${base}/hints.pack_5`, { body: { ...edit, title: rocket.repeat(101) } });
  assert.equal(over.status, 400);
  assert.equal(backend.calls.length, 0);
  const fits = await call("PUT", `${base}/hints.pack_5`, { body: { ...edit, title: rocket.repeat(100) } });
  assert.equal(fits.status, 200);
  assert.equal(backend.calls.length, 1);
});

test("creating a placeholder product is refused with no backend call; editing one is allowed", async () => {
  const { call, backend } = harness({ reply: () => ({ __status: 200, body: { ...pack, demo: true } }) });
  const refused = await call("PUT", `${base}/hints.demo_5`, { body: { ...create, demo: true } });
  assert.deepEqual([refused.status, refused.body.code], [400, "INVALID_REQUEST"]);
  assert.equal(backend.calls.length, 0);
  const edited = await call("PUT", `${base}/hints.demo_5`, { body: { ...edit, demo: true } });
  assert.equal(edited.status, 200);
  assert.equal(backend.calls[0].body.demo, true);
});

test("PUT sends exactly the checked body to the exact path and passes 201 and 200 through", async () => {
  const { call, backend } = harness({ reply: (c) => (c.body.version === undefined ? { __status: 201, body: pack } : { __status: 200, body: { ...pack, version: 2 } }) });
  const made = await call("PUT", `${base}/hints.pack_5`, { body: create });
  assert.equal(made.status, 201);
  assert.deepEqual(made.body, pack);
  const saved = await call("PUT", `${base}/hints.pack_5`, { body: edit });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.version, 2);
  assert.deepEqual(
    backend.calls.map((c) => [c.method, c.path, c.token, c.body]),
    [
      ["PUT", "/v1/admin/store/products/hints.pack_5", "staff", create],
      ["PUT", "/v1/admin/store/products/hints.pack_5", "staff", edit],
    ],
  );
  assert.equal(backend.calls[0].contentType, undefined);
  const passMade = await call("PUT", `${base}/pass.monthly`, { body: { kind: "first_class_pass", title: "Pass", passPeriod: "P1M", demo: false } });
  assert.equal(passMade.status, 201);
});

test("PUT answers other than 200 or 201, or off contract, are 502 BACKEND_CONTRACT", async () => {
  for (const reply of [
    () => ({ __status: 202, body: pack }),
    () => ({ __status: 204, body: pack }),
    () => ({ __status: 200, body: { ...pack, extra: 1 } }),
    () => ({ __status: 201, body: { products: [] } }),
    () => ({ __status: 200, body: null }),
  ]) {
    const { call } = harness({ reply });
    const res = await call("PUT", `${base}/hints.pack_5`, { body: edit });
    assert.deepEqual([res.status, res.body.code], [502, "BACKEND_CONTRACT"]);
  }
});

test("retire and restore send only the version to the exact path", async () => {
  const { call, backend } = harness({ reply: () => ({ ...pack, status: "retired", version: 2 }) });
  const retired = await call("POST", `${base}/hints.pack_5/retire`, { body: { version: 1 } });
  assert.deepEqual([retired.status, retired.body.status, retired.body.version], [200, "retired", 2]);
  const restored = await call("POST", `${base}/hints.pack_5/restore`, { body: { version: 2 } });
  assert.equal(restored.status, 200);
  assert.deepEqual(
    backend.calls.map((c) => [c.method, c.path, c.token, c.body]),
    [
      ["POST", "/v1/admin/store/products/hints.pack_5/retire", "staff", { version: 1 }],
      ["POST", "/v1/admin/store/products/hints.pack_5/restore", "staff", { version: 2 }],
    ],
  );
  const before = backend.calls.length;
  for (const body of [undefined, {}, { version: 0 }, { version: 2147483648 }, { version: "1" }, { version: 1, extra: 1 }, [], "nope"]) {
    const res = await call("POST", `${base}/hints.pack_5/retire`, { body });
    assert.deepEqual([res.status, res.body.code], [400, "INVALID_REQUEST"], JSON.stringify(body));
  }
  assert.equal(backend.calls.length, before);
});

test("a body over 4 KB is 413 TOO_LARGE, declared or not", async () => {
  const { call, backend } = harness();
  const big = { ...edit, title: "x".repeat(5000) };
  const counted = await call("PUT", `${base}/hints.pack_5`, { body: JSON.stringify(big) });
  assert.deepEqual([counted.status, counted.body.code], [413, "TOO_LARGE"]);
  const declared = await call("PUT", `${base}/hints.pack_5`, { body: edit, headers: { "Content-Length": "999999" } }).catch(() => null);
  if (declared) assert.equal(declared.status, 413);
  assert.equal(backend.calls.length, 0);
});

test("backend failures map to website codes, never retried", async () => {
  const cases = [
    [400, "", 400, "INVALID_REQUEST"],
    [401, "", 401, "SIGNED_OUT"],
    [403, "forbidden", 403, "FORBIDDEN"],
    [404, "not_found", 404, "NOT_FOUND"],
    [413, "", 413, "TOO_LARGE"],
    [415, "", 502, "BACKEND_CONTRACT"],
    [418, "", 502, "BACKEND_CONTRACT"],
    [422, "content_invalid", 422, "CONTENT_INVALID"],
    [422, "something_else", 502, "BACKEND_CONTRACT"],
    [500, "", 503, "BACKEND_UNAVAILABLE"],
    [503, "", 503, "BACKEND_UNAVAILABLE"],
    [0, "unreachable", 503, "BACKEND_UNAVAILABLE"],
  ];
  for (const [status, code, wantStatus, wantCode] of cases)
    for (const [method, path, opts] of storeCalls) {
      const { call, backend } = harness({ reply: fail(status, code) });
      const res = await call(method, path, opts);
      assert.deepEqual([res.status, res.body.code], [wantStatus, wantCode], `${status} ${code} ${method} ${path}`);
      assert.equal(backend.calls.length, 1, "one attempt only");
    }
  const content = await harness({ reply: fail(422, "content_invalid") }).call("PUT", `${base}/hints.pack_5`, { body: edit });
  assert.match(content.body.error, /hint pack needs 1 to 1000 hints/);
  assert.match(content.body.error, /placeholder/);
});

test("409 is PRODUCT_EXISTS without a version and VERSION_CONFLICT with one", async () => {
  const conflict = harness({ reply: fail(409, "version_conflict") });
  const exists = await conflict.call("PUT", `${base}/hints.pack_5`, { body: create });
  assert.deepEqual([exists.status, exists.body.code], [409, "PRODUCT_EXISTS"]);
  const stale = await conflict.call("PUT", `${base}/hints.pack_5`, { body: edit });
  assert.deepEqual([stale.status, stale.body.code], [409, "VERSION_CONFLICT"]);
  for (const action of ["retire", "restore"]) {
    const res = await conflict.call("POST", `${base}/hints.pack_5/${action}`, { body: { version: 1 } });
    assert.deepEqual([res.status, res.body.code], [409, "VERSION_CONFLICT"], action);
  }
  assert.equal(conflict.backend.calls.length, 4, "never resent");
});

test("429 passes Retry-After on, rounded up", async () => {
  const { call } = harness({ reply: fail(429, "rate_limited", 2.2) });
  const res = await call("GET", base);
  assert.deepEqual([res.status, res.body.code, res.body.retryAfter], [429, "RATE_LIMITED", 3]);
  assert.equal(res.headers.get("retry-after"), "3");
  const none = await harness({ reply: fail(429, "rate_limited") }).call("GET", base);
  assert.deepEqual([none.status, none.body.code, none.body.retryAfter], [429, "RATE_LIMITED", undefined]);
  assert.equal(none.headers.get("retry-after"), null);
});

test("off-contract list and retire answers are 502 BACKEND_CONTRACT", async () => {
  for (const [method, path, opts, answer] of [
    ["GET", base, {}, { products: [{ ...pack, extra: 1 }] }],
    ["GET", base, {}, { items: [] }],
    ["GET", base, {}, null],
    ["POST", `${base}/hints.pack_5/retire`, { body: { version: 1 } }, { ...pack, status: "gone" }],
    ["POST", `${base}/hints.pack_5/restore`, { body: { version: 1 } }, { products: [] }],
  ]) {
    const { call } = harness({ reply: () => answer });
    const res = await call(method, path, opts);
    assert.deepEqual([res.status, res.body.code], [502, "BACKEND_CONTRACT"], `${method} ${path}`);
  }
});
