// The API route table under the router, in Node: an audience matrix generated from the table,
// the account fence, the origin check, and a few real handlers over the memory store and D1 shim.
import assert from "node:assert/strict";
import { test } from "node:test";
import { memoryEditorialStore } from "../lib/editorial/memory-store.ts";
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
  demo: identity("demo-uid", "demo@example.com"),
};

function harness() {
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
        staffEmails: ["editor@example.com"],
        projectId: project,
        demoUid: "demo-uid",
      }),
    db: () => db,
    photos: () => {
      throw new Error("photo storage is not used in these tests");
    },
    editorial: () => editorial,
    references: async () => ({ airports: [] }),
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
      path.split("/"),
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
