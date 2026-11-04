import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// ===== Contract tests (slice M0). Route tests are appended below this block by slice M1. =====

const media = await import("../lib/request/media.ts");
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
// Property names directly under "properties:" of a schema block (any indent of the first branch).
const propertyNames = (text) => {
  const after = text.slice(text.indexOf("properties:"));
  const indent = after.match(/\n( +)\S/)[1].length;
  return [...after.matchAll(new RegExp(String.raw`\n {${indent}}([A-Za-z]+):`, "g"))].map((m) => m[1]);
};

const licence = {
  credit: "A. Pilot",
  licenceName: "CC BY 4.0",
  licenceUrl: null,
  sourceUrl: null,
  attributionText: null,
  creditRequired: true,
};
const sha = "a".repeat(64);
const version = {
  version: 1,
  sha256: sha,
  contentType: "image/jpeg",
  byteSize: 1000,
  width: 800,
  height: 600,
  licence,
  description: null,
  rights: { statement: "v1_own", statedAt: "2026-11-04T10:00:00.000Z" },
  publishedAt: null,
  createdAt: "2026-11-04T10:00:00.000Z",
};
const item = {
  id: "med-1",
  state: "unverified",
  revision: 1,
  draftVersion: 1,
  publishedVersion: null,
  draft: version,
  createdAt: "2026-11-04T10:00:00.000Z",
  updatedAt: "2026-11-04T10:00:00.000Z",
};
const refBase = { mediaId: "med-1", version: 1, sha256: sha, contentType: "image/png", width: 10, height: 10, licence };
const withUrl = { ...refBase, url: "https://cdn.example.com/x?sig=1", expiresAt: "2026-11-04T11:00:00Z", reason: null };
const noCdn = { ...refBase, url: null, expiresAt: null, reason: "cdn_not_configured" };

test("media schemas list the contract's required keys", () => {
  assert.deepEqual(list(block("MediaState"), "enum"), [...media.mediaStates].sort());
  assert.deepEqual(list(block("MediaContentType"), "enum", 6), [...media.mediaContentTypes].sort());
  assert.deepEqual(list(block("MediaLicence"), "required"), keys(media.mediaLicenceSchema));
  assert.deepEqual(list(block("MediaVersion"), "required"), keys(media.mediaVersionSchema));
  assert.deepEqual(list(block("MediaDetail"), "required"), keys(media.mediaDetailSchema));
  assert.deepEqual(list(block("MediaList"), "required"), keys(media.mediaListSchema));
  assert.deepEqual(list(block("MediaImages"), "required"), keys(media.mediaImagesSchema));
  assert.deepEqual(list(block("MediaRevisionRequest"), "required"), keys(media.mediaRevisionRequestSchema));
  // MediaEditRequest: only revision is required; anyOf needs licence or description.
  const editBlock = block("MediaEditRequest");
  assert.deepEqual(list(editBlock, "required"), ["revision"]);
  assert.ok(editBlock.includes("- required: [licence]") && editBlock.includes("- required: [description]"));
  const editKeys = ["description", "licence", "note", "revision"];
  assert.deepEqual(Object.keys(media.mediaEditRequestObject.shape).sort(), editKeys);
  assert.deepEqual(propertyNames(editBlock).sort(), editKeys);
  assert.deepEqual(list(block("MediaRightsRequest"), "required"), keys(media.mediaRightsRequestSchema));
  assert.deepEqual(list(block("MediaRights"), "required"), ["statedAt", "statement"]);
  assert.deepEqual(Object.keys(media.mediaRightsSchema.shape).sort(), ["statedAt", "statedBy", "statement"]);
  assert.deepEqual(list(block("MediaRights"), "enum", 10), [...media.mediaRightsStatements].sort());
  assert.ok(yaml.includes("enum: [v1_own, v1_authorised] }"), "the upload header and the rights request take the two v1 values");
  assert.ok(yaml.includes("name: X-Rights-Statement") && yaml.includes("/v1/admin/media/{mediaId}/rights:"));
  // MediaItem: `owner` is a property but not required.
  const itemBlock = block("MediaItem");
  const required = list(itemBlock, "required");
  assert.ok(!required.includes("owner"), "owner is not required");
  assert.deepEqual([...required, "owner"].sort(), keys(media.mediaItemSchema));
  assert.ok(itemBlock.includes("owner:"));
});

test("MediaLicenceUpdate has the licence keys, at least one, and no others", () => {
  const text = block("MediaLicenceUpdate");
  assert.ok(text.includes("minProperties: 1"));
  assert.ok(!text.includes("required:"));
  assert.deepEqual(propertyNames(text).sort(), Object.keys(media.mediaLicenceSchema.shape).sort());
  assert.equal(media.mediaLicenceUpdateSchema.safeParse({}).success, false);
  assert.equal(media.mediaLicenceUpdateSchema.safeParse({ credit: null }).success, true);
  assert.equal(media.mediaLicenceUpdateSchema.safeParse({ creditRequired: null }).success, false, "creditRequired cannot be null");
  assert.equal(media.mediaLicenceUpdateSchema.safeParse({ credit: "x", extra: 1 }).success, false);
  assert.equal(media.mediaLicenceUpdateSchema.safeParse({ licenceUrl: "ftp://x" }).success, false);
  assert.equal(media.mediaEditRequestSchema.safeParse({ revision: 1 }).success, false, "licence or description is required");
  assert.equal(media.mediaEditRequestSchema.safeParse({ revision: 1, note: "x" }).success, false);
  assert.equal(media.mediaEditRequestSchema.safeParse({ revision: 1, licence: { credit: "x" } }).success, true);
  assert.equal(media.mediaEditRequestSchema.safeParse({ revision: 1, description: "A hangar at dawn." }).success, true);
  assert.equal(media.mediaEditRequestSchema.safeParse({ revision: 1, description: null }).success, true);
});

test("ImageRef has two branches in the contract and the schema accepts exactly those", () => {
  const text = block("ImageRef");
  assert.equal((text.match(/required: \[/g) ?? []).length, 2);
  assert.ok(text.includes("reason: { type: string, enum: [cdn_not_configured] }"));
  const parse = (value) => media.imageRefSchema.safeParse(value).success;
  assert.equal(parse(withUrl), true);
  assert.equal(parse(noCdn), true);
  assert.equal(parse({ ...withUrl, url: "javascript:alert(1)" }), false);
  assert.equal(parse({ ...withUrl, url: "http://cdn.example.com/x" }), false, "https only");
  assert.equal(parse({ ...withUrl, url: null }), false, "url and expiresAt are both set or both null");
  assert.equal(parse({ ...withUrl, expiresAt: null }), false);
  assert.equal(parse({ ...noCdn, url: "https://cdn.example.com/x" }), false);
  assert.equal(parse({ ...noCdn, reason: "other" }), false);
  assert.equal(parse({ ...withUrl, reason: "cdn_not_configured" }), false);
  assert.equal(parse({ ...withUrl, extra: 1 }), false);
  assert.equal(parse({ ...withUrl, width: 4097 }), false);
  assert.equal(parse({ ...withUrl, sha256: "A".repeat(64) }), false);
  assert.equal(parse({ ...withUrl, mediaId: "med-01" }), false);
});

test("MediaItem, versions and licences are checked against the contract limits", () => {
  const parse = (value) => media.mediaItemSchema.safeParse(value).success;
  assert.equal(parse(item), true, "owner is optional");
  assert.equal(parse({ ...item, owner: "firebase:p:u" }), true);
  assert.equal(parse({ ...item, owner: "" }), false);
  assert.equal(parse({ ...item, extra: 1 }), false);
  assert.equal(parse({ ...item, state: "deleted" }), false);
  assert.equal(parse({ ...item, id: "med-0" }), false);
  assert.equal(parse({ ...item, id: "med-1234567890123456" }), false, "16 digits");
  assert.equal(parse({ ...item, draft: { ...version, byteSize: 5242881 } }), false);
  assert.equal(parse({ ...item, draft: { ...version, byteSize: 5242880 } }), true);
  assert.equal(parse({ ...item, draft: { ...version, contentType: "image/gif" } }), false);
  assert.equal(parse({ ...item, draft: { ...version, licence: { ...licence, licenceUrl: "javascript:x" } } }), false);
  assert.equal(parse({ ...item, draft: { ...version, licence: { ...licence, credit: "" } } }), false);
  assert.equal(media.mediaDetailSchema.safeParse({ item, versions: [version], preview: noCdn }).success, true);
  assert.equal(media.mediaListSchema.safeParse({ items: [item], nextCursor: null }).success, true);
  assert.match("med-123", media.mediaIdPattern);
  assert.doesNotMatch("med-0123", media.mediaIdPattern);
});

test("website error codes are unique strings that equal their keys", () => {
  for (const [key, value] of Object.entries(media.mediaErrorCodes)) assert.equal(key, value);
  for (const code of [
    "MEDIA_UNAVAILABLE",
    "BACKEND_NOT_CONNECTED",
    "ROLES_UNAVAILABLE",
    "PHOTOGRAPHER_REQUIRED",
    "FORBIDDEN",
    "CREDIT_POLICY_STAFF_ONLY",
    "SUBMISSIONS_CLOSED",
    "IDEMPOTENCY_KEY_REUSED",
  ])
    assert.ok(media.mediaErrorCodes[code], code);
  assert.ok(yaml.includes("name: Idempotency-Key") && media.mediaIdempotencyKeyPattern.test("abc_-123"));
  assert.equal(media.mediaIdempotencyKeyPattern.test("a".repeat(129)), false);
});

// ===== End of contract tests =====

// ===== Route tests (slice M1) =====

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

/** Records each backend call; `reply(call)` returns the answer or throws. */
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
function mediaHarness({ roles = "backend", reply = () => item } = {}) {
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
  /** `body`: an object (JSON) or a Uint8Array (raw). */
  async function call(method, path, { as = "photographer", body, headers = {}, from = origin } = {}) {
    const init = { method, headers: { origin: from, cookie: `aa_session=${as}`, ...headers } };
    if (body instanceof Uint8Array) init.body = body;
    else if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers["Content-Type"] = "application/json";
    }
    const response = await handle(new Request(`${origin}/api/${path}`, init), path.split("?")[0].split("/"));
    return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
  }
  return { call, backend };
}

const key = "0b0d3f2e-aaaa-4bbb-8ccc-123456789abc";
const jpeg = (size) => {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff]);
  return bytes;
};
const upload = (extra = {}) => ({
  body: jpeg(100),
  headers: { "Content-Type": "image/jpeg", "Idempotency-Key": key, "X-Rights-Statement": "v1_own" },
  ...extra,
});
const detailAnswer = { item, versions: [item.draft], preview: noCdn };
const edit = { revision: 1, licence: { credit: "A. Pilot" } };
const mediaCalls = [
  ["GET", "media"],
  ["POST", "media", upload()],
  ["GET", "media/med-1"],
  ["PATCH", "media/med-1", { body: edit }],
  ["POST", "media/med-1/versions?revision=1", upload()],
  ["POST", "media/med-1/publish", { as: "staff", body: { revision: 1 } }],
  ["POST", "media/med-1/withdraw", { as: "staff", body: { revision: 1 } }],
];

test("on a mock deployment every media route is 404 MEDIA_UNAVAILABLE and the backend is never called", async () => {
  const { call, backend } = mediaHarness({ roles: "mock" });
  for (const [method, path, opts] of mediaCalls)
    for (const as of ["photographer", "staff", "member"]) {
      const res = await call(method, path, { ...opts, as });
      assert.deepEqual([res.status, res.body.code], [404, "MEDIA_UNAVAILABLE"], `${method} ${path} as ${as}`);
    }
  assert.equal(backend.calls.length, 0);
});

test("router order comes first: guest 401, demo 403, fence 409, origin 403", async () => {
  const { call, backend } = mediaHarness();
  assert.equal((await call("GET", "media", { as: "nobody" })).status, 401);
  for (const [method, path, opts] of mediaCalls) {
    const demo = await call(method, path, { ...opts, as: "demo" });
    assert.deepEqual([demo.status, demo.body.code], [403, "DEMO_ACCOUNT"], `${method} ${path}`);
    const fenced = await call(method, path, { ...opts, headers: { ...opts?.headers, "X-Account-Session": "someone-else" } });
    assert.deepEqual([fenced.status, fenced.body.code], [409, "ACCOUNT_CHANGED"], `${method} ${path}`);
    if (method !== "GET") assert.equal((await call(method, path, { ...opts, from: "https://elsewhere.test" })).status, 403);
  }
  assert.equal(backend.calls.length, 0);
  const session = await accountSessionKey(tokens.photographer.userId);
  const fine = mediaHarness({ reply: () => ({ items: [], nextCursor: null }) });
  assert.equal((await fine.call("GET", "media", { headers: { "X-Account-Session": session } })).status, 200);
});

test("no backend is 503 BACKEND_NOT_CONNECTED, unreadable roles 503 ROLES_UNAVAILABLE, no role 403", async () => {
  for (const [roles, code] of [["not-connected", "BACKEND_NOT_CONNECTED"], ["down", "ROLES_UNAVAILABLE"]]) {
    const { call, backend } = mediaHarness({ roles });
    for (const [method, path, opts] of mediaCalls) {
      const res = await call(method, path, opts);
      assert.deepEqual([res.status, res.body.code], [503, code], `${roles} ${method} ${path}`);
    }
    assert.equal(backend.calls.length, 0);
  }
  const { call, backend } = mediaHarness();
  for (const [method, path, opts] of mediaCalls.slice(0, 5)) {
    const res = await call(method, path, { ...opts, as: "member" });
    assert.deepEqual([res.status, res.body.code], [403, "PHOTOGRAPHER_REQUIRED"], `${method} ${path}`);
  }
  for (const [method, path, opts] of mediaCalls.slice(5))
    for (const as of ["member", "photographer"]) {
      const res = await call(method, path, { ...opts, as });
      assert.deepEqual([res.status, res.body.code], [403, "FORBIDDEN"], `${as} ${method} ${path}`);
    }
  assert.equal(backend.calls.length, 0);
});

test("staff may use the photographer routes too", async () => {
  const { call, backend } = mediaHarness({ reply: () => ({ items: [], nextCursor: null }) });
  assert.equal((await call("GET", "media", { as: "staff" })).status, 200);
  assert.equal(backend.calls[0].token, "staff");
});

test("ids, revisions, states, cursors and parameters are checked before any backend call", async () => {
  const { call, backend } = mediaHarness();
  for (const id of ["med-0", "med-01", "med-1234567890123456", "x", "med-1%2Fx", "MED-1"])
    for (const [method, tail, opts] of [
      ["GET", "", undefined],
      ["PATCH", "", { body: edit }],
      ["POST", "/publish", { as: "staff", body: { revision: 1 } }],
    ]) {
      const res = await call(method, `media/${id}${tail}`, opts);
      assert.deepEqual([res.status, res.body.code], [404, "NOT_FOUND"], `${method} ${id}${tail}`);
    }
  for (const revision of ["", "0", "01", "-1", "1.5", "2147483648", "12345678901", "abc"]) {
    const res = await call("POST", `media/med-1/versions?revision=${revision}`, upload());
    assert.deepEqual([res.status, res.body.code], [400, "INVALID_REQUEST"], `revision ${revision}`);
  }
  assert.equal((await call("POST", "media/med-1/versions", upload())).status, 400, "revision is required");
  assert.equal((await call("POST", "media/med-1/versions?revision=1&revision=2", upload())).status, 400, "not repeated");
  assert.equal((await call("POST", "media/med-1/versions?revision=1&x=1", upload())).status, 400, "no other parameter");
  for (const q of [
    "state=gone",
    "state=published&state=withdrawn",
    "pending=1",
    "pending=false",
    "pending=true&state=withdrawn",
    "pending=true&state=unverified",
    "cursor=",
    `cursor=${"x".repeat(101)}`,
    "cursor=a%0Ab",
    "cursor=a%00b",
    "limit=100",
    "other=1",
  ]) {
    const res = await call("GET", `media?${q}`);
    assert.deepEqual([res.status, res.body.code], [400, "INVALID_REQUEST"], q);
  }
  assert.equal((await call("GET", "media/med-1?x=1")).status, 400);
  assert.equal((await call("POST", "media?x=1", upload())).status, 400);
  assert.equal(backend.calls.length, 0);
});

test("the list forwards only checked filters and always limit=50", async () => {
  const { call, backend } = mediaHarness({ reply: () => ({ items: [item], nextCursor: "c2" }) });
  const res = await call("GET", "media?state=published&pending=true&cursor=abc_-1");
  assert.deepEqual([res.status, res.body.nextCursor], [200, "c2"]);
  await call("GET", "media?pending=true");
  await call("GET", "media?state=unverified");
  await call("GET", "media");
  assert.deepEqual(
    backend.calls.map((c) => c.path),
    [
      "/v1/admin/media?state=published&pending=true&cursor=abc_-1&limit=50",
      "/v1/admin/media?pending=true&limit=50",
      "/v1/admin/media?state=unverified&limit=50",
      "/v1/admin/media?limit=50",
    ],
  );
  assert.ok(backend.calls.every((c) => c.token === "photographer"), "the member's own token");
});

test("detail, edit, publish and withdraw call the matching backend paths", async () => {
  const { call, backend } = mediaHarness({ reply: (c) => (c.method === "GET" ? detailAnswer : item) });
  assert.deepEqual((await call("GET", "media/med-7")).body, detailAnswer);
  const note = "Rights statement v1: own work";
  assert.equal((await call("PATCH", "media/med-7", { body: { ...edit, note } })).status, 200);
  assert.equal((await call("POST", "media/med-7/publish", { as: "staff", body: { revision: 3 } })).status, 200);
  assert.equal((await call("POST", "media/med-7/withdraw", { as: "staff", body: { revision: 4 } })).status, 200);
  assert.deepEqual(
    backend.calls.map((c) => [c.method, c.path, c.body]),
    [
      ["GET", "/v1/admin/media/med-7", undefined],
      ["PATCH", "/v1/admin/media/med-7", { ...edit, note }],
      ["POST", "/v1/admin/media/med-7/publish", { revision: 3 }],
      ["POST", "/v1/admin/media/med-7/withdraw", { revision: 4 }],
    ],
  );
});

test("edit bodies are strict; publish and withdraw take only a revision", async () => {
  const { call, backend } = mediaHarness();
  for (const body of [
    { revision: 1 },
    { revision: 1, note: "x" },
    { licence: { credit: "x" } },
    { revision: 0, licence: { credit: "x" } },
    { revision: 1, licence: {} },
    { revision: 1, licence: { credit: "" } },
    { revision: 1, licence: { licenceUrl: "javascript:alert(1)" } },
    { revision: 1, licence: { credit: "x" }, extra: 1 },
    { revision: 1, licence: { owner: "x" } },
    { revision: 1, licence: { credit: "x" }, note: "" },
  ]) {
    const res = await call("PATCH", "media/med-1", { body });
    assert.deepEqual([res.status, res.body.code], [400, "INVALID_REQUEST"], JSON.stringify(body));
  }
  for (const action of ["publish", "withdraw"])
    for (const body of [{}, { revision: 1, note: "no" }, { revision: "1" }, { revision: 2147483648 }]) {
      const res = await call("POST", `media/med-1/${action}`, { as: "staff", body });
      assert.deepEqual([res.status, res.body.code], [400, "INVALID_REQUEST"], `${action} ${JSON.stringify(body)}`);
    }
  const notJson = await call("PATCH", "media/med-1", { body: new TextEncoder().encode("{nope") });
  assert.equal(notJson.status, 400);
  const big = await call("PATCH", "media/med-1", { body: { revision: 1, licence: { attributionText: "x".repeat(17000) } } });
  assert.deepEqual([big.status, big.body.code], [413, "TOO_LARGE"]);
  assert.equal(backend.calls.length, 0);
});

test("creditRequired is staff only; a photographer is refused before the backend", async () => {
  const { call, backend } = mediaHarness();
  const body = { revision: 1, licence: { credit: "x", creditRequired: false } };
  const refused = await call("PATCH", "media/med-1", { body });
  assert.deepEqual([refused.status, refused.body.code], [403, "CREDIT_POLICY_STAFF_ONLY"]);
  assert.equal(backend.calls.length, 0);
  assert.equal((await call("PATCH", "media/med-1", { as: "staff", body })).status, 200);
  assert.deepEqual(backend.calls[0].body, body);
});

test("uploads forward the key, the canonical type and the bytes; the backend status is kept", async () => {
  const { call, backend } = mediaHarness({
    reply: (c) => ({ __status: c.options.idempotencyKey === "replay" ? 200 : 201, body: item }),
  });
  const created = await call("POST", "media", upload());
  assert.deepEqual([created.status, created.body.id], [201, "med-1"]);
  const replay = await call("POST", "media", upload({ headers: { "Content-Type": "image/png; charset=binary; x=y", "Idempotency-Key": "replay", "X-Rights-Statement": "v1_authorised" } }));
  assert.equal(replay.status, 200);
  assert.equal((await call("POST", "media/med-1/versions?revision=4", upload())).status, 201);
  const [a, b, c] = backend.calls;
  assert.deepEqual([a.method, a.path, a.contentType, a.options], ["POST", "/v1/admin/media", "image/jpeg", { idempotencyKey: key, rightsStatement: "v1_own", timeoutMs: 30000 }]);
  assert.equal(b.options.rightsStatement, "v1_authorised", "the chosen statement is forwarded as given");
  assert.equal(c.options.rightsStatement, "v1_own");
  assert.ok(a.body instanceof Uint8Array && a.body.byteLength === 100 && a.body[0] === 0xff, "raw bytes, not JSON");
  assert.equal(b.contentType, "image/png", "parameters are stripped");
  assert.deepEqual([c.path, c.options.timeoutMs], ["/v1/admin/media/med-1/versions?revision=4", 30000]);
});

test("upload checks run before the body is read: key, type, declared length", async () => {
  const { call, backend } = mediaHarness();
  for (const k of [undefined, "", "has space", "a".repeat(129), "bad/key", "bad.key"]) {
    const headers = { "Content-Type": "image/jpeg", "X-Rights-Statement": "v1_own", ...(k === undefined ? {} : { "Idempotency-Key": k }) };
    const res = await call("POST", "media", { body: jpeg(10), headers });
    assert.deepEqual([res.status, res.body.code], [400, "INVALID_REQUEST"], `key ${k}`);
  }
  for (const type of [undefined, "image/gif", "application/json", "image/jpegx", "text/plain"]) {
    const headers = { "Idempotency-Key": key, "X-Rights-Statement": "v1_own", ...(type ? { "Content-Type": type } : {}) };
    const res = await call("POST", "media", { body: jpeg(10), headers });
    assert.deepEqual([res.status, res.body.code], [415, "UNSUPPORTED_TYPE"], `type ${type}`);
  }
  const declared = await call("POST", "media", upload({ headers: { "Content-Type": "image/jpeg", "Idempotency-Key": key, "X-Rights-Statement": "v1_own", "Content-Length": "5242881" } }));
  assert.deepEqual([declared.status, declared.body.code], [413, "TOO_LARGE"]);
  assert.equal(backend.calls.length, 0);
});

test("body limit: 5,242,880 bytes pass, 5,242,881 is 413 without a backend call, empty is 400", async () => {
  const { call, backend } = mediaHarness();
  const ok = await call("POST", "media", upload({ body: jpeg(5242880) }));
  assert.equal(ok.status, 201);
  assert.equal(backend.calls[0].body.byteLength, 5242880);
  const over = await call("POST", "media", upload({ body: jpeg(5242881) }));
  assert.deepEqual([over.status, over.body.code], [413, "TOO_LARGE"]);
  assert.equal(backend.calls.length, 1);
  const empty = await call("POST", "media", upload({ body: new Uint8Array(0) }));
  assert.deepEqual([empty.status, empty.body.code], [400, "INVALID_REQUEST"]);
  assert.equal(backend.calls.length, 1);
});

test("a lying Content-Length cannot get a larger body through the counted reader", async () => {
  const { call, backend } = mediaHarness();
  const headers = { "Content-Type": "image/jpeg", "Idempotency-Key": key, "X-Rights-Statement": "v1_own", "Content-Length": "10" };
  const res = await call("POST", "media", { body: jpeg(5242881), headers });
  assert.deepEqual([res.status, res.body.code], [413, "TOO_LARGE"]);
  assert.equal(backend.calls.length, 0);
});

test("backend failures map to website codes, and nothing is retried", async () => {
  const cases = [
    [400, "invalid_request", 400, "INVALID_REQUEST"],
    [401, "unauthorized", 401, "SIGNED_OUT"],
    [403, "forbidden", 403, "PHOTOGRAPHER_REQUIRED"],
    [404, "not_found", 404, "NOT_FOUND"],
    [409, "version_conflict", 409, "VERSION_CONFLICT"],
    [409, "nothing_to_publish", 409, "NOTHING_TO_PUBLISH"],
    [413, "invalid_request", 413, "TOO_LARGE"],
    [415, "invalid_request", 415, "UNSUPPORTED_TYPE"],
    [422, "media_invalid", 422, "MEDIA_INVALID"],
    [422, "idempotency_key_reused", 422, "IDEMPOTENCY_KEY_REUSED"],
    [422, "content_invalid", 422, "LICENCE_INCOMPLETE"],
    [422, "something_else", 502, "BACKEND_CONTRACT"],
    [429, "rate_limited", 429, "RATE_LIMITED"],
    [503, "storage_unavailable", 503, "STORAGE_UNAVAILABLE"],
    [503, "unavailable", 503, "BACKEND_UNAVAILABLE"],
    [500, "internal", 503, "BACKEND_UNAVAILABLE"],
    [426, "upgrade_required", 503, "BACKEND_UNAVAILABLE"],
    [0, "unreachable", 503, "BACKEND_UNAVAILABLE"],
  ];
  for (const [status, code, want, wantCode] of cases)
    for (const [method, path, opts] of [mediaCalls[0], mediaCalls[1], mediaCalls[3]]) {
      const { call, backend } = mediaHarness({
        reply: () => {
          throw new BackendError(status, code);
        },
      });
      const res = await call(method, path, opts);
      assert.deepEqual([res.status, res.body.code], [want, wantCode], `${status} ${code} ${method} ${path}`);
      assert.equal(backend.calls.length, 1, "never retried");
    }
  const refused = mediaHarness({
    reply: () => {
      throw new BackendError(403, "forbidden");
    },
  });
  const publish = await refused.call("POST", "media/med-1/publish", { as: "staff", body: { revision: 1 } });
  assert.deepEqual([publish.status, publish.body.code], [403, "FORBIDDEN"]);
  const gone = mediaHarness({
    reply: () => {
      throw new BackendNotConnected();
    },
  });
  const res = await gone.call("GET", "media");
  assert.deepEqual([res.status, res.body.code], [503, "BACKEND_NOT_CONNECTED"]);
});

test("429 and storage outages keep Retry-After in the header and the body", async () => {
  const fail = (status, code, retry) =>
    mediaHarness({
      reply: () => {
        throw new BackendError(status, code, retry);
      },
    });
  const res = await fail(429, "rate_limited", 12).call("GET", "media");
  assert.deepEqual([res.status, res.body.code, res.body.retryAfter, res.headers.get("Retry-After")], [429, "RATE_LIMITED", 12, "12"]);
  const out = await fail(503, "storage_unavailable", 5).call("POST", "media", upload());
  assert.deepEqual([out.status, out.body.code, out.headers.get("Retry-After")], [503, "STORAGE_UNAVAILABLE", "5"]);
  const bare = await fail(429, "rate_limited").call("GET", "media");
  assert.equal(bare.headers.get("Retry-After"), null);
  assert.equal("retryAfter" in bare.body, false);
  const other = await fail(503, "unavailable", 9).call("GET", "media");
  assert.equal(other.headers.get("Retry-After"), null);
});

test("answers off the contract are 502 BACKEND_CONTRACT, including a non-https image link", async () => {
  for (const [path, answer] of [
    ["media", { items: [{ ...item, extra: 1 }], nextCursor: null }],
    ["media", { items: [] }],
    ["media/med-1", { ...detailAnswer, preview: { ...withUrl, url: "javascript:alert(1)" } }],
    ["media/med-1", { ...detailAnswer, preview: { ...withUrl, url: "http://cdn.example.com/x" } }],
    ["media/med-1", { ...detailAnswer, preview: { ...withUrl, url: null } }],
  ]) {
    const res = await mediaHarness({ reply: () => answer }).call("GET", path);
    assert.deepEqual([res.status, res.body.code], [502, "BACKEND_CONTRACT"], path);
    assert.equal(JSON.stringify(res.body).includes("javascript"), false, "the answer is not echoed");
  }
  assert.equal((await mediaHarness({ reply: () => detailAnswer }).call("GET", "media/med-1")).status, 200);
  assert.equal((await mediaHarness({ reply: () => ({ ...detailAnswer, preview: withUrl }) }).call("GET", "media/med-1")).status, 200);
  const badUpload = await mediaHarness({ reply: () => ({ ...item, state: "deleted" }) }).call("POST", "media", upload());
  assert.equal(badUpload.status, 502);
  const oddStatus = await mediaHarness({ reply: () => ({ __status: 202, body: item }) }).call("POST", "media", upload());
  assert.equal(oddStatus.status, 502);
});

test("in backend mode the member D1 submission routes are closed; staff still read the photo", async () => {
  for (const roles of ["backend", "down", "not-connected"]) {
    const { call } = mediaHarness({ roles });
    for (const [method, path] of [
      ["GET", "submissions"],
      ["POST", "submissions"],
      ["PUT", "submissions/x-1"],
      ["GET", "submissions/x-1/photo"],
    ])
      for (const as of ["member", "photographer"]) {
        const res = await call(method, path, { as, body: method === "GET" ? undefined : {} });
        assert.deepEqual([res.status, res.body?.code], [404, "SUBMISSIONS_CLOSED"], `${roles} ${as} ${method} ${path}`);
      }
  }
  const { call } = mediaHarness();
  const staffPhoto = await call("GET", "submissions/x-1/photo", { as: "staff" });
  assert.notEqual(staffPhoto.body?.code, "SUBMISSIONS_CLOSED", "admins reviewing existing proposals keep access");
  assert.equal((await call("GET", "admin/submissions", { as: "staff" })).status, 200);
});

test("in mock mode the member D1 submission routes are closed too (D-2 amended 11-04)", async () => {
  const { call } = mediaHarness({ roles: "mock" });
  for (const [method, path, as] of [
    ["GET", "submissions", "member"],
    ["POST", "submissions", "member"],
    ["POST", "submissions", "photographer"],
  ]) {
    const res = await call(method, path, { as, body: method === "GET" ? undefined : {} });
    assert.deepEqual([res.status, res.body.code], [404, "SUBMISSIONS_CLOSED"], `${as} ${method} ${path}`);
  }
});

test("X-Rights-Statement is required and checked before the body is read; nothing reaches the backend", async () => {
  const { call, backend } = mediaHarness();
  const base = { "Content-Type": "image/jpeg", "Idempotency-Key": key };
  for (const value of [undefined, "", "own", "v1", "v2_own", "V1_OWN", "d1_private_review", "v1_own, v1_authorised", "v1-own"]) {
    const headers = value === undefined ? base : { ...base, "X-Rights-Statement": value };
    for (const path of ["media", "media/med-1/versions?revision=1"]) {
      const res = await call("POST", path, { body: jpeg(10), headers });
      assert.deepEqual([res.status, res.body.code], [400, "INVALID_REQUEST"], `${path} ${value}`);
    }
  }
  // Checked before the body: a body stream that must not be pulled is never touched.
  assert.equal(backend.calls.length, 0);
  for (const statement of ["v1_own", "v1_authorised"]) {
    const res = await call("POST", "media", { body: jpeg(10), headers: { ...base, "X-Rights-Statement": statement } });
    assert.equal(res.status, 201, statement);
  }
  assert.deepEqual(backend.calls.map((c) => c.options.rightsStatement), ["v1_own", "v1_authorised"]);
});

test("a backend 403 on a version upload is FORBIDDEN for staff, NOT_FOUND stays for a non-owner photographer", async () => {
  const refuse = (status, code) => ({
    reply: () => {
      throw new BackendError(status, code);
    },
  });
  const staff = await mediaHarness(refuse(403, "forbidden")).call("POST", "media/med-1/versions?revision=1", upload({ as: "staff" }));
  assert.deepEqual([staff.status, staff.body.code], [403, "FORBIDDEN"]);
  assert.equal(staff.body.error, "Only the photographer who owns this photo can add versions.");
  const other = await mediaHarness(refuse(404, "not_found")).call("POST", "media/med-1/versions?revision=1", upload());
  assert.deepEqual([other.status, other.body.code], [404, "NOT_FOUND"]);
  const created = await mediaHarness(refuse(403, "forbidden")).call("POST", "media", upload());
  assert.equal(created.body.code, "PHOTOGRAPHER_REQUIRED", "a plain upload 403 is still a lost role");
});

const rights = { revision: 2, statement: "v1_authorised" };

test("PUT media/:id/rights: gate order, strict body, forwarded as given", async () => {
  const mock = mediaHarness({ roles: "mock" });
  assert.deepEqual([(await mock.call("PUT", "media/med-1/rights", { body: rights })).body.code], ["MEDIA_UNAVAILABLE"]);
  assert.equal(mock.backend.calls.length, 0);
  for (const [roles, code] of [["not-connected", "BACKEND_NOT_CONNECTED"], ["down", "ROLES_UNAVAILABLE"]]) {
    const res = await mediaHarness({ roles }).call("PUT", "media/med-1/rights", { body: rights });
    assert.deepEqual([res.status, res.body.code], [503, code]);
  }
  const { call, backend } = mediaHarness();
  assert.equal((await call("PUT", "media/med-1/rights", { as: "nobody", body: rights })).status, 401);
  assert.equal((await call("PUT", "media/med-1/rights", { as: "demo", body: rights })).body.code, "DEMO_ACCOUNT");
  assert.equal((await call("PUT", "media/med-1/rights", { body: rights, headers: { "X-Account-Session": "other" } })).body.code, "ACCOUNT_CHANGED");
  assert.equal((await call("PUT", "media/med-1/rights", { body: rights, from: "https://elsewhere.test" })).status, 403);
  assert.equal((await call("PUT", "media/med-1/rights", { as: "member", body: rights })).body.code, "PHOTOGRAPHER_REQUIRED");
  assert.equal((await call("PUT", "media/med-01/rights", { body: rights })).body.code, "NOT_FOUND");
  assert.equal((await call("PUT", "media/med-1/rights?x=1", { body: rights })).status, 400);
  for (const body of [
    {},
    { revision: 2 },
    { statement: "v1_own" },
    { revision: 0, statement: "v1_own" },
    { revision: 2147483648, statement: "v1_own" },
    { revision: "2", statement: "v1_own" },
    { revision: 2, statement: "d1_private_review" },
    { revision: 2, statement: "own" },
    { revision: 2, statement: "v1_own", note: "x" },
  ]) {
    const res = await call("PUT", "media/med-1/rights", { body });
    assert.deepEqual([res.status, res.body.code], [400, "INVALID_REQUEST"], JSON.stringify(body));
  }
  assert.equal(backend.calls.length, 0);
  const ok = await call("PUT", "media/med-9/rights", { body: rights });
  assert.deepEqual([ok.status, ok.body.id], [200, "med-1"]);
  assert.deepEqual([backend.calls[0].method, backend.calls[0].path, backend.calls[0].body, backend.calls[0].token], ["PUT", "/v1/admin/media/med-9/rights", rights, "photographer"]);
  assert.equal((await call("PUT", "media/med-9/rights", { as: "staff", body: rights })).status, 200, "staff pass the gate; the backend enforces the owner");
});

test("rights errors: rights_already_stated and a stale revision are different 409s; a staff non-owner is FORBIDDEN", async () => {
  const fail = (status, code) =>
    mediaHarness({
      reply: () => {
        throw new BackendError(status, code);
      },
    });
  const stated = await fail(409, "rights_already_stated").call("PUT", "media/med-1/rights", { body: rights });
  assert.deepEqual([stated.status, stated.body.code], [409, "RIGHTS_ALREADY_STATED"]);
  const stale = await fail(409, "version_conflict").call("PUT", "media/med-1/rights", { body: rights });
  assert.deepEqual([stale.status, stale.body.code], [409, "VERSION_CONFLICT"]);
  const other = await fail(409, "something_new").call("PUT", "media/med-1/rights", { body: rights });
  assert.equal(other.body.code, "VERSION_CONFLICT");
  const notOwner = await fail(403, "forbidden").call("PUT", "media/med-1/rights", { as: "staff", body: rights });
  assert.deepEqual([notOwner.status, notOwner.body.code], [403, "FORBIDDEN"]);
  const missing = await fail(404, "not_found").call("PUT", "media/med-1/rights", { body: rights });
  assert.equal(missing.body.code, "NOT_FOUND");
  const publish = await fail(422, "content_invalid").call("POST", "media/med-1/publish", { as: "staff", body: { revision: 1 } });
  assert.deepEqual([publish.status, publish.body.code], [422, "LICENCE_INCOMPLETE"]);
});

test("PATCH: licence and/or description; description is normalised before it is forwarded", async () => {
  const { call, backend } = mediaHarness();
  const patch = (body, as) => call("PATCH", "media/med-1", { body, as });
  assert.equal((await patch({ revision: 1, description: "  A Spitfire.\r\nTaken at Duxford.  " })).status, 200);
  assert.deepEqual(backend.calls[0].body, { revision: 1, description: "A Spitfire.\nTaken at Duxford." }, "CRLF becomes LF, trimmed, newlines kept");
  assert.equal((await patch({ revision: 1, description: null })).status, 200);
  assert.deepEqual(backend.calls[1].body, { revision: 1, description: null });
  assert.equal((await patch({ revision: 1, description: "x", licence: { credit: "A" }, note: "n" })).status, 200);
  assert.deepEqual(backend.calls[2].body, { revision: 1, licence: { credit: "A" }, description: "x", note: "n" });
  assert.equal((await patch({ revision: 1, description: "😀".repeat(2000) })).status, 200, "limits count code points");
  const before = backend.calls.length;
  for (const description of ["", "   ", "\n\n", "a".repeat(2001), "😀".repeat(2001), "tab\there", "\tlead", "trail\t", "bell\u0007", "lone\rcr", "nul\u0000", "line\u2028sep", 5, true, {}])
    assert.equal((await patch({ revision: 1, description })).status, 400, JSON.stringify(description));
  assert.equal((await patch({ revision: 1, note: "only a note" })).status, 400);
  assert.equal((await patch({ revision: 1, description: undefined })).status, 400);
  assert.equal(backend.calls.length, before, "invalid descriptions never reach the backend");
  const credit = await patch({ revision: 1, description: "x", licence: { creditRequired: true } });
  assert.deepEqual([credit.status, credit.body.code], [403, "CREDIT_POLICY_STAFF_ONLY"]);
  assert.equal((await patch({ revision: 1, description: "x", licence: { creditRequired: true } }, "staff")).status, 200);
});

test("a backend description is counted in code points: 2000 emoji parse, 2001 do not", async () => {
  const withDescription = (description) => ({ ...item, draft: { ...item.draft, description } });
  const ok = await mediaHarness({ reply: () => withDescription("😀".repeat(2000)) }).call("POST", "media", upload());
  assert.equal(ok.status, 201);
  assert.equal(ok.body.draft.description.length, 4000, "UTF-16 length is not the limit");
  for (const bad of ["😀".repeat(2001), ""]) {
    const res = await mediaHarness({ reply: () => withDescription(bad) }).call("POST", "media", upload());
    assert.deepEqual([res.status, res.body.code], [502, "BACKEND_CONTRACT"]);
  }
  assert.equal(media.mediaItemSchema.safeParse(withDescription("a".repeat(2000))).success, true);
  assert.equal(media.mediaItemSchema.safeParse(withDescription(null)).success, true);
});
