import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { SETTING_KEYS, setting } from "../lib/settings.ts";
import { normalizeAppPath, parseSurface, surfaceServes } from "../lib/surface.ts";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

function sources(dir) {
  const out = [];
  for (const name of readdirSync(path.join(root, dir))) {
    const rel = path.join(dir, name);
    if (statSync(path.join(root, rel)).isDirectory()) out.push(...sources(rel));
    else if (/\.(ts|tsx|mts|mjs)$/.test(name)) out.push(rel.split(path.sep).join("/"));
  }
  return out;
}

test("app code never imports cloudflare:workers or the retired #runtime alias", () => {
  const offenders = ["app", "lib", "components", "db"]
    .flatMap(sources)
    .concat(["proxy.ts", "vite.config.ts"])
    .filter((file) => /["'](cloudflare:workers|#runtime)["']/.test(read(file)));
  assert.deepEqual(offenders, []);
});

test("the build has no Cloudflare plugin", () => {
  assert.doesNotMatch(read("vite.config.ts"), /@cloudflare\/vite-plugin/);
  assert.equal(JSON.parse(read("package.json")).devDependencies["@cloudflare/vite-plugin"], undefined);
});

test("settings come from the process environment; non-strings and unset read as undefined", () => {
  const key = "MOCK_PHOTOGRAPHER_EMAILS";
  const before = process.env[key];
  try {
    process.env[key] = "a@b.test";
    assert.equal(setting(key), "a@b.test");
    delete process.env[key];
    assert.equal(setting(key), undefined);
  } finally {
    if (before === undefined) delete process.env[key];
    else process.env[key] = before;
  }
});

test("web.env.example names every setting the server reads", () => {
  const example = read("web.env.example");
  for (const key of SETTING_KEYS) assert.match(example, new RegExp(`^#? ?${key}=`, "m"), key);
  for (const key of ["HOST", "PORT"]) assert.match(example, new RegExp(`^${key}=`, "m"), key);
});

test("SITE_SURFACE: only public or admin in production; development defaults to both", () => {
  assert.equal(parseSurface("public", false), "public");
  assert.equal(parseSurface("admin", false), "admin");
  assert.equal(parseSurface(undefined, false), null);
  assert.equal(parseSurface("", false), null);
  assert.equal(parseSurface("Admin", false), null);
  assert.equal(parseSurface(undefined, true), "all");
  assert.equal(parseSurface("bogus", true), null);
});

test("the public surface serves everything except the admin pages and admin API", () => {
  for (const p of ["/", "/games/aircraft-identifier", "/account", "/contribute", "/api/health", "/api/featured", "/api/media", "/administrator"])
    assert.ok(surfaceServes("public", p, "GET"), p);
  for (const p of ["/admin", "/admin/sign-in", "/api/admin", "/api/admin/military", "/api/admin/store/products"])
    assert.ok(!surfaceServes("public", p, "GET"), p);
});

test("the admin surface serves the desks and only the API they call", () => {
  for (const [p, m] of [
    ["/admin", "GET"], ["/admin/sign-in", "GET"], ["/api/admin/military", "POST"], ["/api/auth/session", "POST"],
    ["/api/auth/config", "GET"], ["/api/account", "GET"], ["/api/health", "GET"], ["/api/media/abc/publish", "POST"],
    ["/api/submissions/abc/photo", "GET"],
  ])
    assert.ok(surfaceServes("admin", p, m), `${m} ${p}`);
  for (const [p, m] of [
    ["/", "GET"], ["/account", "GET"], ["/contribute", "GET"], ["/administrator", "GET"], ["/api/featured", "GET"],
    ["/api/submissions", "POST"], ["/api/submissions/abc", "PUT"], ["/api/submissions/abc/photo", "POST"],
    ["/api/me/roles/photographer", "POST"], ["/api/photos/abc", "GET"],
  ])
    assert.ok(!surfaceServes("admin", p, m), `${m} ${p}`);
});

test("encoded, doubled, dotted and upper-case paths cannot reach the other surface", () => {
  for (const p of ["/api/%61dmin/audit", "/api/a%64min/roles", "//api/admin/audit", "/api//admin/audit", "/api/admin%2Faudit",
    "/api/x/../admin/audit", "/api/x/%2e%2e/admin/audit", "/API/Admin/audit", "/%61dmin", "/Admin", "/api/%zz"])
    assert.ok(!surfaceServes("public", p, "POST"), p);
  for (const p of ["/%61ccount", "/admin/../account", "/admin/%2e%2e/contribute", "//", "/api/%61dmin/../featured", "/admin/%zz"])
    assert.ok(!surfaceServes("admin", p, "GET"), p);
  assert.equal(normalizeAppPath("/api//%61dmin/./x/../audit"), "/api/admin/audit");
  assert.equal(normalizeAppPath("/%E0%A4%A"), null);
});

test("the admin surface serves /sign-out so staff can sign out", () => {
  assert.ok(surfaceServes("admin", "/sign-out", "GET"));
  assert.ok(surfaceServes("public", "/sign-out", "GET"));
});

test("no surface serves anything", () => {
  assert.ok(!surfaceServes(null, "/", "GET"));
  assert.ok(!surfaceServes(null, "/api/health", "GET"));
});

test("the server entry refuses to start without a valid SITE_SURFACE or PORT", () => {
  const entry = path.join(root, "scripts", "node-server.mjs");
  const run = (env) =>
    spawnSync(process.execPath, [entry], { env: { PATH: process.env.PATH, ...env }, encoding: "utf8", timeout: 20_000 });
  for (const env of [{ PORT: "3999" }, { SITE_SURFACE: "both", PORT: "3999" }, { SITE_SURFACE: "public" }, { SITE_SURFACE: "admin", PORT: "x" }]) {
    const result = run(env);
    assert.equal(result.status, 1, JSON.stringify(env));
    assert.match(result.stderr, /Refusing to start/);
  }
});
