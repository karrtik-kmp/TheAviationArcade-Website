// The API route table under the router, in Node: an audience matrix generated from the table,
// the account fence, the origin check, and a few real handlers over the memory store and D1 shim.
import assert from "node:assert/strict";
import { test } from "node:test";
import { memoryEditorialStore } from "../lib/editorial/memory-store.ts";
import { d1ContentStore } from "../lib/editorial/content-d1.ts";
import { AuthUnavailable, accountSessionKey, resolvePrincipal } from "../lib/request/principal.ts";
import { dispatch } from "../lib/request/router.ts";
import { routes } from "../lib/request/routes.ts";
import { d1Sqlite } from "./support/d1-sqlite.mjs";

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
  unverified: { ...identity("fresh", "fresh@example.com"), emailVerified: false },
  demo: identity("demo-uid", "demo@example.com"),
};
const row = (role, state = "active") => ({
  role,
  state,
  revision: 1,
  requestedAt: "2026-11-01T00:00:00.000Z",
  decidedAt: state === "pending" ? null : "2026-11-02T00:00:00.000Z",
});
/** Each token's backend role rows; "down" means the backend could not be read. */
const backendRoles = {
  staff: [row("player"), row("admin")],
  member: [row("player")],
  photographer: [row("player"), row("photographer")],
};

/** A fake game backend: records each call and answers with `reply(method, path, body, token)`. */
function fakeBackend(reply = () => ({})) {
  const calls = [];
  return {
    calls,
    as(bearer) {
      const token = bearer.reveal();
      const run = async (method, path, body) => {
        calls.push({ method, path, body, token });
        return reply(method, path, body, token);
      };
      return { getJson: (path) => run("GET", path), send: (method, path, body) => run(method, path, body) };
    },
  };
}

function harness({ backend = fakeBackend(), roles = backendRoles } = {}) {
  const verifier = {
    calls: 0,
    async verify(token) {
      verifier.calls += 1;
      if (token === "down") throw new AuthUnavailable();
      return tokens[token] ?? null;
    },
  };
  const db = d1Sqlite();
  const editorial = memoryEditorialStore();
  const handle = dispatch(routes, {
    principal: (request) =>
      resolvePrincipal(request.headers, {
        verifier,
        cookieName: "aa_session",
        roles: async (bearer, user) =>
          typeof roles === "function"
            ? roles(bearer, user)
            : roles === "down"
              ? { status: "unavailable" }
              : { status: "ok", roles: roles[bearer.reveal()] ?? [] },
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
  async function call(method, path, { as, body, fence, from = origin } = {}) {
    const headers = { origin: from };
    if (as) headers.cookie = `aa_session=${as}`;
    if (fence) headers["X-Account-Session"] = fence;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await handle(
      new Request(`${origin}/api/${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      path.split("?")[0].split("/"),
    );
    return { status: response.status, body: await response.json().catch(() => null) };
  }
  return { call, verifier };
}

const concrete = (path) => path.replace(/:[a-z]+/g, "x-1");
const nonPublic = routes.filter((r) => r.audience !== "public");

test("every route declares an audience, and everything under admin/ is staff-only", () => {
  for (const r of routes) {
    assert.ok(["public", "member", "owner", "staff"].includes(r.audience), r.path);
    if (r.path.startsWith("admin/")) assert.equal(r.audience, "staff", r.path);
    if (r.audience === "public") assert.ok(!r.mutation, r.path);
  }
  const keys = routes.map((r) => `${r.method} ${r.path}`);
  assert.equal(new Set(keys).size, keys.length, "no route is listed twice");
});

test("guests get 401 and the demo account 403 on every non-public route", async () => {
  const { call } = harness();
  for (const r of nonPublic) {
    assert.equal((await call(r.method, concrete(r.path))).status, 401, `${r.method} ${r.path}`);
    const demo = await call(r.method, concrete(r.path), { as: "demo" });
    assert.deepEqual([demo.status, demo.body.code], [403, "DEMO_ACCOUNT"], `${r.method} ${r.path}`);
  }
});

test("a member who is not staff gets 403 on every staff route", async () => {
  const { call } = harness();
  for (const r of routes.filter((r) => r.audience === "staff")) {
    const res = await call(r.method, concrete(r.path), { as: "member" });
    assert.equal(res.status, 403, `${r.method} ${r.path}`);
    assert.match(res.body.error, /authorized editors/);
  }
});

test("the account fence refuses a stale session on every non-public route, after sign-in", async () => {
  const { call } = harness();
  for (const r of nonPublic) {
    const res = await call(r.method, concrete(r.path), { as: "staff", fence: "another-account" });
    assert.deepEqual([res.status, res.body.code], [409, "ACCOUNT_CHANGED"], `${r.method} ${r.path}`);
    // As before: a guest or the demo account with a stale header is refused for who they are.
    assert.equal((await call(r.method, concrete(r.path), { fence: "x" })).status, 401);
    assert.equal((await call(r.method, concrete(r.path), { as: "demo", fence: "x" })).status, 403);
  }
  const key = await accountSessionKey(tokens.staff.userId);
  assert.equal((await call("GET", "admin/military", { as: "staff", fence: key })).status, 200);
});

test("mutations from another origin are refused after sign-in", async () => {
  const { call } = harness();
  for (const r of routes.filter((r) => r.mutation)) {
    const res = await call(r.method, concrete(r.path), { as: "staff", from: "https://elsewhere.test", body: {} });
    assert.deepEqual([res.status, res.body.error], [403, "This request must come from this website."], r.path);
  }
  // Recorded change: a signed-out cross-origin submission is now refused for signing in first.
  assert.equal((await call("POST", "submissions", { from: "https://elsewhere.test" })).status, 401);
});

test("one verification per request; none for public routes", async () => {
  const { call, verifier } = harness();
  assert.equal((await call("GET", "featured")).status, 200);
  assert.equal(verifier.calls, 0);
  const saved = await call("PUT", "admin/military/mil-a1", {
    as: "staff",
    body: {
      version: 0,
      stage: "missing_photo",
      data: {
        photoSource: "",
        submissionId: "",
        licenseUrl: "",
        permission: "",
        attribution: "",
        referenceUrl: "",
        answer: "",
        aliases: [],
        distractors: ["", "", ""],
        hint: "",
        reveal: "",
        checklist: { identity: false, answers: false, crop: false, clipperCard: false },
        notes: "",
      },
    },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.package.data.answer, "Warthog A-10 Thunderbolt II");
  assert.equal(verifier.calls, 1);
});

test("a refused release returns every reason", async () => {
  const { call } = harness();
  const state = (await call("GET", "admin/military", { as: "staff" })).body;
  const refused = await call("POST", "admin/military/releases", {
    as: "staff",
    body: { basis: "", previewed: true, pointerVersion: state.pointer.version },
  });
  assert.equal(refused.status, 422);
  assert.equal(refused.body.error, "This batch cannot be released yet.");
  assert.ok(refused.body.errors.includes("Trainee: 0 of 6 questions approved."));
});

test("unknown paths keep their old answers", async () => {
  const { call } = harness();
  assert.equal((await call("GET", "admin/nothing")).status, 401);
  assert.equal((await call("GET", "admin/nothing", { as: "member" })).status, 403);
  assert.equal((await call("GET", "admin/nothing", { as: "staff" })).status, 404);
  assert.equal((await call("GET", "submissions/a/b/c")).status, 401);
  assert.equal((await call("GET", "nothing")).status, 404);
  assert.equal((await call("DELETE", "featured")).status, 404);
});

test("an unreachable sign-in service gives 503", async () => {
  const { call } = harness();
  const res = await call("GET", "admin/military", { as: "down" });
  assert.equal(res.status, 503);
});

// Roles come from the game backend (Backend ADR-0002). The website keeps no allowlist.

const adminRow = (over = {}) => ({
  principal: `firebase:${project}:lens`,
  role: "photographer",
  state: "pending",
  revision: 3,
  requestedAt: "2026-11-01T00:00:00.000Z",
  decidedAt: null,
  decidedBy: null,
  note: null,
  requestEmail: "lens@example.com",
  grantEmail: null,
  email: "lens@example.com",
  emailSource: "verified_at_request",
  ...over,
});

test("staff and photographer come only from active backend roles", async () => {
  const { call } = harness();
  assert.equal((await call("GET", "admin/military", { as: "staff" })).status, 200);
  assert.equal((await call("GET", "admin/military", { as: "photographer" })).status, 403, "a photographer is not staff");
  const pending = harness({ roles: { ...backendRoles, staff: [row("admin", "pending")] } });
  assert.equal((await pending.call("GET", "admin/military", { as: "staff" })).status, 403, "a pending admin row grants nothing");
  const revoked = harness({ roles: { ...backendRoles, staff: [row("admin", "revoked")] } });
  assert.equal((await revoked.call("GET", "admin/military", { as: "staff" })).status, 403, "a revoked admin row grants nothing");
});

test("unreadable roles fail closed with 503, never as staff", async () => {
  const { call } = harness({ roles: "down" });
  const res = await call("GET", "admin/military", { as: "staff" });
  assert.deepEqual([res.status, res.body.code], [503, "ROLES_UNAVAILABLE"]);
  const photo = await call("POST", "submissions", { as: "photographer", body: {} });
  assert.deepEqual([photo.status, photo.body.code], [403, "ROLES_UNAVAILABLE"]);
});

test("new photos and revisions need an active photographer role", async () => {
  const { call } = harness();
  for (const [method, path] of [["POST", "submissions"], ["PUT", "submissions/x-1"]]) {
    const res = await call(method, path, { as: "member", body: {} });
    assert.deepEqual([res.status, res.body.code], [403, "PHOTOGRAPHER_REQUIRED"], `${method} ${path}`);
  }
  // A photographer passes the role check and reaches the request's own validation.
  const res = await call("POST", "submissions", { as: "photographer", body: {} });
  assert.notEqual(res.body?.code, "PHOTOGRAPHER_REQUIRED");
  assert.equal((await call("GET", "submissions", { as: "member" })).status, 200, "reading your own list needs no role");
});

test("a member reads their own roles and asks for photographer with their own token", async () => {
  const backend = fakeBackend((method, path) =>
    method === "POST" && path === "/v1/me/roles/photographer"
      ? { role: row("photographer", "pending"), changed: true }
      : {},
  );
  const { call } = harness({ backend });
  const mine = await call("GET", "me/roles", { as: "member" });
  assert.deepEqual([mine.status, mine.body.roles.map((r) => r.role)], [200, ["player"]]);
  const asked = await call("POST", "me/roles/photographer", { as: "member" });
  assert.deepEqual([asked.status, asked.body.role.state], [201, "pending"]);
  assert.deepEqual(backend.calls, [{ method: "POST", path: "/v1/me/roles/photographer", body: undefined, token: "member" }]);
});

test("admins list role rows by state; the backend sees the admin's own token", async () => {
  const backend = fakeBackend(() => ({ requests: [adminRow()], nextCursor: null }));
  const { call } = harness({ backend });
  const res = await call("GET", "admin/roles?state=active", { as: "staff" });
  assert.equal(res.status, 200);
  assert.equal(res.body.requests[0].requestEmail, "lens@example.com");
  assert.equal(res.body.self, `firebase:${project}:editor`);
  assert.deepEqual(backend.calls, [
    { method: "GET", path: "/v1/admin/role-requests?state=active&limit=100", body: undefined, token: "staff" },
  ]);
  assert.equal((await call("GET", "admin/roles?state=everything", { as: "staff" })).status, 400);
});

test("a decision forwards the revision the admin saw to the encoded account path", async () => {
  const backend = fakeBackend((method, path, body) => ({ role: adminRow({ state: "active", revision: body.revision + 1 }) }));
  const { call } = harness({ backend });
  const principal = encodeURIComponent(`firebase:${project}:lens`);
  const res = await call("POST", `admin/roles/firebase:${project}:lens/photographer/approve`, {
    as: "staff",
    body: { revision: 3, note: "  Good portfolio  " },
  });
  assert.deepEqual([res.status, res.body.role.state], [200, "active"]);
  assert.deepEqual(backend.calls, [
    {
      method: "POST",
      path: `/v1/admin/accounts/${principal}/roles/photographer/approve`,
      body: { revision: 3, note: "Good portfolio" },
      token: "staff",
    },
  ]);
});

test("only offered actions reach the backend, with a revision and nothing else", async () => {
  const backend = fakeBackend(() => ({ role: adminRow() }));
  const { call } = harness({ backend });
  const path = (role, action) => `admin/roles/firebase:${project}:lens/${role}/${action}`;
  for (const [role, action] of [["admin", "approve"], ["admin", "block"], ["admin", "unblock"], ["player", "revoke"], ["admin", "grant"], ["photographer", "delete"]])
    assert.equal((await call("POST", path(role, action), { as: "staff", body: { revision: 1 } })).status, 404, `${role} ${action}`);
  assert.equal((await call("POST", path("photographer", "reject"), { as: "staff", body: {} })).status, 400, "revision required");
  assert.equal(
    (await call("POST", path("photographer", "reject"), { as: "staff", body: { revision: 1, state: "active" } })).status,
    400,
    "no other fields",
  );
  assert.equal(backend.calls.length, 0);
});

test("a stale revision is 409 VERSION_CONFLICT and is not retried", async () => {
  const { BackendError } = await import("../lib/request/backend.ts");
  const backend = fakeBackend(() => {
    throw new BackendError(409, "version_conflict");
  });
  const { call } = harness({ backend });
  const res = await call("POST", `admin/roles/firebase:${project}:lens/admin/revoke`, { as: "staff", body: { revision: 2 } });
  assert.deepEqual([res.status, res.body.code], [409, "VERSION_CONFLICT"]);
  assert.equal(backend.calls.length, 1);
});

test("a backend answer off the contract is refused, not passed on", async () => {
  const backend = fakeBackend(() => ({ requests: [{ ...adminRow(), extra: true }], nextCursor: null }));
  const { call } = harness({ backend });
  const res = await call("GET", "admin/roles", { as: "staff" });
  assert.deepEqual([res.status, res.body.code], [502, "BACKEND_CONTRACT"]);
});

test("a backend refusal keeps its meaning: 403 is FORBIDDEN, not a lost session", async () => {
  const { BackendError } = await import("../lib/request/backend.ts");
  const backend = fakeBackend(() => {
    throw new BackendError(403, "forbidden");
  });
  const { call } = harness({ backend });
  const res = await call("POST", `admin/roles/firebase:${project}:lens/photographer/approve`, {
    as: "staff",
    body: { revision: 1 },
  });
  assert.deepEqual([res.status, res.body.code], [403, "FORBIDDEN"]);
});

test("an account id that is not a principal never reaches the backend", async () => {
  const backend = fakeBackend(() => ({ role: adminRow() }));
  const { call } = harness({ backend });
  for (const principal of ["..", "firebase:p", "firebase:p:a/b", "google:p:uid", `firebase:${project}:a:b`]) {
    const res = await call("POST", ["admin", "roles", principal, "photographer", "approve"].join("/"), {
      as: "staff",
      body: { revision: 1 },
    });
    assert.equal(res.status, principal.includes("/") ? 404 : 400, principal);
  }
  assert.equal(backend.calls.length, 0);
});

test("asking for photographer needs a verified email; unreadable roles say so", async () => {
  const backend = fakeBackend(() => ({ role: row("photographer", "pending"), changed: true }));
  const { call } = harness({ backend, roles: { ...backendRoles, unverified: [] } });
  const res = await call("POST", "me/roles/photographer", { as: "unverified" });
  assert.deepEqual([res.status, res.body.code], [403, "EMAIL_UNVERIFIED"]);
  assert.equal(backend.calls.length, 0);
  const down = harness({ roles: "down" });
  const mine = await down.call("GET", "me/roles", { as: "member" });
  assert.deepEqual([mine.status, mine.body.code], [503, "ROLES_UNAVAILABLE"]);
});

test("mock roles from the deployment's lists: verified emails only, and nothing to request or decide", async () => {
  const { mockRoles } = await import("../lib/request/roles.ts");
  const lists = { admins: ["editor@example.com"], photographers: ["lens@example.com"] };
  const backend = fakeBackend(() => ({}));
  const { call } = harness({ backend, roles: async (_bearer, user) => mockRoles(user, lists) });
  assert.equal((await call("GET", "admin/military", { as: "staff" })).status, 200, "a listed admin is staff");
  assert.equal((await call("GET", "admin/military", { as: "photographer" })).status, 403);
  assert.equal((await call("POST", "submissions", { as: "member", body: {} })).body.code, "PHOTOGRAPHER_REQUIRED");
  assert.notEqual((await call("POST", "submissions", { as: "photographer", body: {} })).body?.code, "PHOTOGRAPHER_REQUIRED");
  for (const [method, path, as] of [
    ["POST", "me/roles/photographer", "member"],
    ["GET", "admin/roles", "staff"],
    ["POST", `admin/roles/firebase:${project}:lens/photographer/approve`, "staff"],
  ]) {
    const res = await call(method, path, { as, body: method === "POST" ? { revision: 1 } : undefined });
    assert.deepEqual([res.status, res.body.code], [404, "ROLES_MOCK"], `${method} ${path}`);
  }
  assert.equal(backend.calls.length, 0, "mock mode never calls the backend");
});

// openapi 0.15.0: block/unblock, typed admin email.

test("block and unblock forward the revision the admin saw", async () => {
  const backend = fakeBackend((method, path, body) => ({ role: adminRow({ state: "blocked", revision: body.revision + 1 }) }));
  const { call } = harness({ backend });
  const principal = encodeURIComponent(`firebase:${project}:lens`);
  for (const action of ["block", "unblock"]) {
    const res = await call("POST", `admin/roles/firebase:${project}:lens/photographer/${action}`, {
      as: "staff",
      body: { revision: 4 },
    });
    assert.equal(res.status, 200, action);
  }
  assert.deepEqual(
    backend.calls.map((c) => [c.method, c.path, c.body]),
    [
      ["POST", `/v1/admin/accounts/${principal}/roles/photographer/block`, { revision: 4 }],
      ["POST", `/v1/admin/accounts/${principal}/roles/photographer/unblock`, { revision: 4 }],
    ],
  );
  const list = harness({ backend: fakeBackend(() => ({ requests: [], nextCursor: null })) });
  assert.equal((await list.call("GET", "admin/roles?state=blocked", { as: "staff" })).status, 200);
});

test("an admin's typed email is set or cleared with a PUT fenced by revision", async () => {
  const typed = adminRow({ role: "admin", state: "active", requestEmail: null, grantEmail: "ed@example.com", email: "ed@example.com", emailSource: "typed" });
  const backend = fakeBackend(() => ({ role: typed }));
  const { call } = harness({ backend });
  const path = `admin/roles/firebase:${project}:editor/admin/email`;
  const set = await call("PUT", path, { as: "staff", body: { revision: 2, email: "  Ed@Example.com " } });
  assert.deepEqual([set.status, set.body.role.emailSource], [200, "typed"]);
  assert.equal((await call("PUT", path, { as: "staff", body: { revision: 3, email: null } })).status, 200);
  assert.equal((await call("PUT", path, { as: "staff", body: { revision: 3, email: "" } })).status, 200, "empty clears");
  assert.deepEqual(
    backend.calls.map((c) => [c.method, c.path, c.body]),
    [
      ["PUT", `/v1/admin/accounts/${encodeURIComponent(`firebase:${project}:editor`)}/roles/admin/email`, { revision: 2, email: "Ed@Example.com" }],
      ["PUT", `/v1/admin/accounts/${encodeURIComponent(`firebase:${project}:editor`)}/roles/admin/email`, { revision: 3, email: null }],
      ["PUT", `/v1/admin/accounts/${encodeURIComponent(`firebase:${project}:editor`)}/roles/admin/email`, { revision: 3, email: null }],
    ],
  );
  for (const body of [{ email: "a@b.c" }, { revision: 1 }, { revision: 1, email: 5 }, { revision: 1, email: "a@b\u0007" }, { revision: 1, email: "x", note: "y" }])
    assert.equal((await call("PUT", path, { as: "staff", body })).status, 400, JSON.stringify(body));
  assert.equal((await call("PUT", path, { as: "member", body: { revision: 1, email: null } })).status, 403);
  assert.equal(backend.calls.length, 3);
});

test("notes with control characters are refused before the backend", async () => {
  const backend = fakeBackend(() => ({ role: adminRow() }));
  const { call } = harness({ backend });
  const res = await call("POST", `admin/roles/firebase:${project}:lens/photographer/reject`, {
    as: "staff",
    body: { revision: 1, note: "line one\nline two" },
  });
  assert.equal(res.status, 400);
  assert.equal(backend.calls.length, 0);
});

test("a blocked account asking for photographer gets PHOTOGRAPHER_BLOCKED", async () => {
  const { BackendError } = await import("../lib/request/backend.ts");
  const backend = fakeBackend(() => {
    throw new BackendError(403, "forbidden");
  });
  const { call } = harness({ backend });
  const res = await call("POST", "me/roles/photographer", { as: "member" });
  assert.deepEqual([res.status, res.body.code], [403, "PHOTOGRAPHER_BLOCKED"]);
});

test("a blocked photographer row is no role", async () => {
  const { call } = harness({ roles: { ...backendRoles, photographer: [row("photographer", "blocked")] } });
  const res = await call("POST", "submissions", { as: "photographer", body: {} });
  assert.deepEqual([res.status, res.body.code], [403, "PHOTOGRAPHER_REQUIRED"]);
});
