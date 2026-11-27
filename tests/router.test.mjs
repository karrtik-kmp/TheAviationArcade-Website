// The website's API route table under the router, in Node: an audience matrix generated from the table,
// the account fence, the origin check and the member role routes. The website has no staff routes (the
// Admin is its own repo, decision I-1); the router's staff gate is still checked on a stand-in route.
import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthUnavailable, accountSessionKey, resolvePrincipal } from "../lib/request/principal.ts";
import { dispatch } from "../lib/request/router.ts";
import { routes } from "../lib/request/routes.ts";

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

function harness({ backend = fakeBackend(), roles = backendRoles, table = routes } = {}) {
  const verifier = {
    calls: 0,
    async verify(token) {
      verifier.calls += 1;
      if (token === "down") throw new AuthUnavailable();
      return tokens[token] ?? null;
    },
  };
  const handle = dispatch(table, {
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
    planeOfTheDay: async () => ({ state: "ok", day: "2026-11-27", features: [] }),
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

test("every route declares an audience; none is staff and none is under admin/", () => {
  for (const r of routes) {
    assert.ok(["public", "member", "owner"].includes(r.audience), r.path);
    assert.ok(!r.path.startsWith("admin"), r.path);
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

test("the account fence refuses a stale session on every non-public route, after sign-in", async () => {
  const { call } = harness();
  for (const r of nonPublic) {
    const res = await call(r.method, concrete(r.path), { as: "member", fence: "another-account" });
    assert.deepEqual([res.status, res.body.code], [409, "ACCOUNT_CHANGED"], `${r.method} ${r.path}`);
    assert.equal((await call(r.method, concrete(r.path), { fence: "x" })).status, 401);
    assert.equal((await call(r.method, concrete(r.path), { as: "demo", fence: "x" })).status, 403);
  }
  const key = await accountSessionKey(tokens.member.userId);
  assert.equal((await call("GET", "me/roles", { as: "member", fence: key })).status, 200);
});

test("mutations from another origin are refused after sign-in", async () => {
  const { call } = harness();
  for (const r of routes.filter((r) => r.mutation)) {
    const res = await call(r.method, concrete(r.path), { as: "photographer", from: "https://elsewhere.test", body: {} });
    assert.deepEqual([res.status, res.body.error], [403, "This request must come from this website."], r.path);
  }
  assert.equal((await call("POST", "submissions", { from: "https://elsewhere.test" })).status, 401);
});

test("one verification per request; none for public routes", async () => {
  const { call, verifier } = harness();
  assert.equal((await call("GET", "featured")).status, 200);
  assert.equal(verifier.calls, 0);
  assert.equal((await call("GET", "me/roles", { as: "member" })).status, 200);
  assert.equal(verifier.calls, 1);
});

test("admin paths are a plain 404 for everyone: the desks are on the Admin", async () => {
  const { call, verifier } = harness();
  for (const as of [undefined, "member", "staff"])
    for (const [method, path] of [
      ["GET", "admin/military"],
      ["GET", "admin/roles"],
      ["POST", "admin/store/products/x/retire"],
      ["GET", "admin/audit"],
      ["GET", "admin/nothing"],
    ])
      assert.equal(
        (await call(method, path, { as, body: method === "POST" ? {} : undefined })).status,
        404,
        `${as} ${method} ${path}`,
      );
  assert.equal(verifier.calls, 0, "no sign-in check for a path that does not exist");
});

test("unknown paths keep their old answers", async () => {
  const { call } = harness();
  assert.equal((await call("GET", "submissions/a/b/c")).status, 401);
  assert.equal((await call("GET", "nothing")).status, 404);
  assert.equal((await call("DELETE", "featured")).status, 404);
});

test("an unreachable sign-in service gives 503", async () => {
  const { call } = harness();
  assert.equal((await call("GET", "me/roles", { as: "down" })).status, 503);
});

// The router's staff gate is shared with the Admin repo. The website has no staff route, so it is
// checked on a stand-in: staff only from an active backend admin row, and unreadable roles fail closed.
const staffProbe = [{ method: "GET", path: "probe", audience: "staff", run: async () => Response.json({ ok: true }) }];

test("the router's staff gate: only an active backend admin row, never a photographer", async () => {
  const { call } = harness({ table: staffProbe });
  assert.equal((await call("GET", "probe", { as: "staff" })).status, 200);
  const member = await call("GET", "probe", { as: "member" });
  assert.equal(member.status, 403);
  assert.match(member.body.error, /authorized editors/);
  assert.equal((await call("GET", "probe", { as: "photographer" })).status, 403, "a photographer is not staff");
  for (const state of ["pending", "revoked", "blocked"]) {
    const other = harness({ table: staffProbe, roles: { ...backendRoles, staff: [row("admin", state)] } });
    assert.equal((await other.call("GET", "probe", { as: "staff" })).status, 403, `a ${state} admin row grants nothing`);
  }
});

test("unreadable roles fail closed with 503, never as staff", async () => {
  const probe = await harness({ table: staffProbe, roles: "down" }).call("GET", "probe", { as: "staff" });
  assert.deepEqual([probe.status, probe.body.code], [503, "ROLES_UNAVAILABLE"]);
  const { call } = harness({ roles: "down" });
  const media = await call("GET", "media", { as: "photographer" });
  assert.deepEqual([media.status, media.body.code], [503, "ROLES_UNAVAILABLE"]);
  const photo = await call("POST", "submissions", { as: "photographer", body: {} });
  assert.deepEqual([photo.status, photo.body.code], [404, "SUBMISSIONS_CLOSED"]);
});

/** Roles as the deployment's mock lists give them. */
const mockBackendRoles = async (bearer) => ({ status: "ok", roles: backendRoles[bearer.reveal()] ?? [], source: "mock" });

test("the website's own proposal routes are closed to everyone in every mode (D-2 amended 11-04)", async () => {
  for (const roles of [backendRoles, mockBackendRoles, "down"]) {
    const { call } = harness({ roles });
    for (const [method, path, as] of [
      ["GET", "submissions", "photographer"],
      ["POST", "submissions", "photographer"],
      ["POST", "submissions", "member"],
      ["PUT", "submissions/x-1", "photographer"],
      ["GET", "submissions/x-1/photo", "member"],
      ["GET", "submissions/x-1/photo", "staff"],
    ]) {
      const res = await call(method, path, { as, body: method === "GET" ? undefined : {} });
      assert.deepEqual([res.status, res.body.code], [404, "SUBMISSIONS_CLOSED"], `${method} ${path} ${as}`);
    }
  }
});

test("mock roles from the deployment's lists: verified emails only, and nothing to request", async () => {
  const { mockRoles } = await import("../lib/request/roles.ts");
  const lists = { admins: ["editor@example.com"], photographers: ["lens@example.com"] };
  const backend = fakeBackend(() => ({}));
  const { call } = harness({
    backend,
    roles: async (_bearer, user) => mockRoles(user, lists),
    table: [...routes, ...staffProbe],
  });
  assert.equal((await call("GET", "probe", { as: "staff" })).status, 200, "a listed admin is staff");
  assert.equal((await call("GET", "probe", { as: "photographer" })).status, 403);
  const media = await call("GET", "media", { as: "photographer" });
  assert.deepEqual([media.status, media.body.code], [404, "MEDIA_UNAVAILABLE"]);
  const asked = await call("POST", "me/roles/photographer", { as: "member" });
  assert.deepEqual([asked.status, asked.body.code], [404, "ROLES_MOCK"]);
  assert.equal(backend.calls.length, 0, "mock mode never calls the backend");
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
  const res = await call("GET", "media", { as: "photographer" });
  assert.deepEqual([res.status, res.body.code], [403, "PHOTOGRAPHER_REQUIRED"]);
});
