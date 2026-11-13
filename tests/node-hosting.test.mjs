import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { SETTING_KEYS, setting } from "../lib/settings.ts";

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

test("the website has no admin pages, admin API or surface switch (the Admin is its own repo)", () => {
  const app = sources("app");
  assert.deepEqual(app.filter((file) => file.startsWith("app/admin/")), []);
  assert.ok(!app.some((file) => /surface/.test(read(file))), "no surface check in app code");
  assert.doesNotMatch(read("proxy.ts"), /surface/i);
});

test("the server entry refuses to start without a valid PORT or with a SITE_SURFACE other than public", () => {
  const entry = path.join(root, "scripts", "node-server.mjs");
  const run = (env) =>
    spawnSync(process.execPath, [entry], { env: { PATH: process.env.PATH, ...env }, encoding: "utf8", timeout: 20_000 });
  for (const env of [{}, { SITE_SURFACE: "public" }, { SITE_SURFACE: "admin", PORT: "3999" }, { SITE_SURFACE: "both", PORT: "3999" }, { PORT: "x" }]) {
    const result = run(env);
    assert.equal(result.status, 1, JSON.stringify(env));
    assert.match(result.stderr, /Refusing to start/);
  }
});
