import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const source = new URL("../", import.meta.url);
const requiredSecrets = ["BUNNY_STORAGE_PASSWORD", "STAFF_EMAILS"];

async function fixture(t, { omitWorkersDev = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "airplane-deploy-"));
  t.after(async () => {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith("airplane-deploy-"));
    await rm(root, { recursive: true, force: true });
  });
  const put = async (relative, contents) => {
    const destination = path.join(root, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, contents);
  };
  await put("package.json", '{"type":"module"}');
  for (const script of ["prepare-cloudflare-deploy.mjs", "cloudflare-local-settings.mjs", "execution-profile.mjs", "run-framework.mjs", "deploy-cloudflare.mjs"]) {
    await mkdir(path.join(root, "scripts"), { recursive: true });
    await copyFile(new URL(`scripts/${script}`, source), path.join(root, "scripts", script));
  }
  const target = JSON.parse(await readFile(new URL("config/cloudflare-prototype.json", source), "utf8"));
  if (omitWorkersDev) delete target.workersDev;
  await put("config/cloudflare-prototype.json", JSON.stringify(target));
  await put(".dev.vars.cloudflare", "BUNNY_STORAGE_PASSWORD=test-only-secret\nSTAFF_EMAILS=editor@example.test\n");
  await put("outputs/firebase-web-config.json", JSON.stringify({ runtimeBindings: {
    FIREBASE_PROJECT_ID: "airplane-games-auth-20261022",
    FIREBASE_WEB_API_KEY: "test-only-web-key",
    FIREBASE_AUTH_DOMAIN: "airplane-games-auth-20261022.firebaseapp.com",
    FIREBASE_APP_ID: "test-only-app",
  } }));
  await put("dist/server/index.js", "export default {};");
  await put("dist/client/index.html", "test fixture");
  await put("dist/server/wrangler.json", JSON.stringify({
    compatibility_date: "2026-05-15", compatibility_flags: ["nodejs_compat"],
    rules: [{ type: "ESModule", globs: ["**/*.js"] }],
    r2_buckets: [{ binding: "BUCKET", bucket_name: "site-creator-r2" }],
  }));
  await put(".wrangler/deploy/config.json", JSON.stringify({ configPath: "../../dist/server/wrangler.json" }));
  // A framework build finishes asynchronously and replaces Wrangler's redirect.
  await put("node_modules/vinext/package.json", '{"type":"module"}');
  await put("node_modules/vinext/dist/cli.js", `
    import { writeFile } from "node:fs/promises";
    setTimeout(async () => {
      await writeFile(".wrangler/deploy/config.json", JSON.stringify({ configPath: "../../dist/server/wrangler.json" }));
    }, 50);
  `);
  await put("node_modules/wrangler/bin/wrangler.js", `
    import { writeFile } from "node:fs/promises";
    await writeFile("wrangler-invocation.json", JSON.stringify(process.argv.slice(2)));
  `);
  const run = (script, args = []) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" });
  const json = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
  return { root, put, run, json };
}

async function assertBunnyDefault(f, { workersDev = true } = {}) {
  const redirect = await f.json(".wrangler/deploy/config.json");
  assert.equal(path.resolve(f.root, ".wrangler/deploy", redirect.configPath), path.join(f.root, "outputs/cloudflare-deploy/wrangler.json"));
  const config = await f.json("outputs/cloudflare-deploy/wrangler.json");
  assert.equal(config.vars.PHOTO_STORAGE_PROVIDER, "bunny");
  assert.equal(config.r2_buckets, undefined);
  assert.equal(config.d1_databases[0].database_name, "aviation-arcade-website");
  assert.equal(config.workers_dev, workersDev);
  assert.equal(config.preview_urls, false);
  assert.ok(!JSON.stringify(config).includes("test-only-secret"));
}

test("preparation keeps workers.dev disabled when the source target has no explicit option", async (t) => {
  const f = await fixture(t, { omitWorkersDev: true });
  const result = f.run("scripts/prepare-cloudflare-deploy.mjs");
  assert.equal(result.status, 0, result.stderr);
  await assertBunnyDefault(f, { workersDev: false });
  const secrets = await f.json("outputs/cloudflare-secrets.json");
  assert.deepEqual(Object.keys(secrets).sort(), [...requiredSecrets].sort());
  assert.ok(!result.stdout.includes("test-only-secret"));
});

test("preparation enables workers.dev when the source target explicitly enables it", async (t) => {
  const f = await fixture(t);
  const result = f.run("scripts/prepare-cloudflare-deploy.mjs");
  assert.equal(result.status, 0, result.stderr);
  await assertBunnyDefault(f, { workersDev: true });
});

test("a completed portable build restores Bunny as the default after the framework resets it", async (t) => {
  const f = await fixture(t);
  const result = f.run("scripts/run-framework.mjs", ["build"]);
  assert.equal(result.status, 0, result.stderr);
  await assertBunnyDefault(f);
});

test("deploy rebuilds and supplies Bunny config and secrets to the project-local Wrangler", async (t) => {
  const f = await fixture(t);
  const result = f.run("scripts/deploy-cloudflare.mjs", ["--dry-run"]);
  assert.equal(result.status, 0, result.stderr);
  await assertBunnyDefault(f);
  assert.deepEqual(await f.json("wrangler-invocation.json"), [
    "deploy", "--config", "outputs/cloudflare-deploy/wrangler.json",
    "--secrets-file", "outputs/cloudflare-secrets.json", "--dry-run",
  ]);
});

test("deploy rejects missing credentials, target overrides and failed builds before upload", async (t) => {
  const f = await fixture(t);
  await f.put(".dev.vars.cloudflare", "BUNNY_STORAGE_PASSWORD=\nSTAFF_EMAILS=editor@example.test\n");
  let result = f.run("scripts/deploy-cloudflare.mjs");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Fill BUNNY_STORAGE_PASSWORD/);
  await assert.rejects(f.json("wrangler-invocation.json"), { code: "ENOENT" });
  await f.put(".dev.vars.cloudflare", "BUNNY_STORAGE_PASSWORD=test-only-secret\nSTAFF_EMAILS=editor@example.test\n");
  result = f.run("scripts/deploy-cloudflare.mjs", ["--config", "wrong-target.json"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cannot be overridden/);
  await assert.rejects(f.json("wrangler-invocation.json"), { code: "ENOENT" });
  await f.put("node_modules/vinext/dist/cli.js", "process.exit(7);");
  result = f.run("scripts/deploy-cloudflare.mjs");
  assert.equal(result.status, 7);
  await assert.rejects(f.json("wrangler-invocation.json"), { code: "ENOENT" });
});
