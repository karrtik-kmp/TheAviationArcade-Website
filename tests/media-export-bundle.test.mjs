// The D1 -> backend photo export CLI core: the output folder rules, the bundle writer, the drift check and the
// argument parser, over the node:sqlite D1 stand-in and an in-memory byte store. No network, no Miniflare.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Log, LogLevel, Miniflare } from "miniflare";
import { loadDemoData, reviewSubmission, writeSubmission } from "../lib/submissions/d1.ts";
import { MANIFEST_FILE, STATE_FILE, buildManifest, parseManifest, sha256Hex } from "../lib/submissions/export.ts";
import { EXIT, REPO_ROOT, Refusal, parseArgs, runExport, runVerify } from "../scripts/media-export/bundle.mjs";
import { LOCAL_D1_ID, LOCAL_R2_BUCKET, localSource, localStatePaths, objectFileName, readCapped } from "../scripts/media-export/local.mjs";
import { d1Sqlite } from "./support/d1-sqlite.mjs";
import { submissionData } from "./support/fixtures.mjs";

const PROJECT = "demo-airplane-games";
const OWNER = `firebase:${PROJECT}:photographer`;
const STAFF = `firebase:${PROJECT}:editor`;
const EMAIL = "secret-photographer@example.com";
const CREDIT = "Credit Line Not For Reports";
const now = () => new Date(Date.now() + 60_000);

const jpeg = (n) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n, 1, 2, 3, 4, 5]);

/** A seeded D1 stand-in, a byte store and a source over them. */
async function setup(count = 2) {
  const db = d1Sqlite();
  const store = new Map();
  const failing = new Set();
  const photos = { put: async (key, bytes) => void store.set(key, bytes), delete: async (key) => void store.delete(key) };
  const ids = [];
  for (let n = 1; n <= count; n += 1) {
    const bytes = jpeg(n);
    const { submission } = await writeSubmission(db, () => photos, {
      owner: OWNER,
      key: `retry-key-${String(n).padStart(10, "0")}`,
      old: null,
      payload: JSON.stringify(submissionData({ email: EMAIL, credit: CREDIT })),
      image: { bytes, mime: "image/jpeg", width: 1200, height: 800, digest: sha256Hex(bytes) },
    });
    ids.push(submission.id);
  }
  const keyOf = (id) => db.sqlite.prepare("SELECT image_key FROM submissions WHERE id = ?").get(id).image_key;
  const opened = { rows: 0, closed: 0 };
  const source = {
    async rows(sql) {
      opened.rows += 1;
      return (await db.prepare(sql).all()).results;
    },
    async readImage(key) {
      if (failing.has(key)) throw Object.assign(new Error("boom with a secret"), { status: 503 });
      return store.get(key) ?? null;
    },
    async close() {
      opened.closed += 1;
    },
  };
  return { db, store, source, ids, keyOf, failing, opened };
}

async function temp() {
  return mkdtemp(path.join(tmpdir(), "media-export-test-"));
}

async function exportTo(ctx, extra = {}) {
  const parent = await temp();
  const outDir = path.join(parent, "bundle");
  const lines = [];
  const result = await runExport({ source: ctx.source, outDir, project: PROJECT, now: now(), log: (l) => lines.push(l), ...extra });
  return { parent, outDir, lines, result, text: lines.join("\n") };
}

test("an export writes every photo, the state file and the manifest, and the disk digest equals the manifest's", async () => {
  const ctx = await setup(2);
  const { parent, outDir, result, text } = await exportTo(ctx);
  try {
    assert.equal(result.exitCode, EXIT.ok);
    const manifest = parseManifest(await readFile(path.join(outDir, MANIFEST_FILE), "utf8"));
    assert.ok(manifest.ok);
    assert.equal(manifest.manifest.entries.length, 2);
    for (const entry of manifest.manifest.entries) {
      const onDisk = await readFile(path.join(outDir, entry.file));
      assert.equal(sha256Hex(onDisk), entry.sha256);
      assert.equal(entry.owner, OWNER);
      assert.ok(ctx.ids.includes(entry.sourceId));
    }
    const state = JSON.parse(await readFile(path.join(outDir, STATE_FILE), "utf8"));
    assert.deepEqual(state.map((s) => s.id).sort(), [...ctx.ids].sort());
    assert.equal(ctx.opened.closed, 1);
    assert.match(text, /Exported: 2/);
    assert.match(text, /holds private photos; don't use a cloud-synced folder/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("the report never carries an email, credit, owner or storage key", async () => {
  const ctx = await setup(2);
  ctx.db.sqlite.prepare("UPDATE submissions SET image_bytes = 6000000 WHERE id = ?").run(ctx.ids[0]);
  const { parent, text } = await exportTo(ctx);
  try {
    for (const secret of [EMAIL, CREDIT, OWNER, "submissions/", "preview@sites.test"]) assert.ok(!text.includes(secret), `report leaked ${secret}`);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("demo rows are skipped and a row with a non-JSON payload is skipped without stopping the run", async () => {
  const ctx = await setup(2);
  await loadDemoData(ctx.db, STAFF);
  ctx.db.sqlite.prepare("UPDATE submissions SET payload = 'not json {' WHERE id = ?").run(ctx.ids[0]);
  const { parent, outDir, result, text } = await exportTo(ctx);
  try {
    assert.equal(result.exitCode, EXIT.ok);
    assert.equal(result.summary.exported, 1);
    assert.deepEqual(result.summary.counts.map((c) => [c.reason, c.count]).sort(), [["bad_payload", 1], ["demo", 2]]);
    assert.match(text, new RegExp(`bad_payload \\(1\\): ${ctx.ids[0]}`));
    const manifest = parseManifest(await readFile(path.join(outDir, MANIFEST_FILE), "utf8"));
    assert.deepEqual(manifest.manifest.entries.map((e) => e.sourceId), [ctx.ids[1]]);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("a photo over the size cap is listed first as needing re-upload by the photographer", async () => {
  const ctx = await setup(2);
  ctx.db.sqlite.prepare("UPDATE submissions SET width = 5000 WHERE id = ?").run(ctx.ids[0]);
  ctx.db.sqlite.prepare("UPDATE submissions SET payload = 'x' WHERE id = ?").run(ctx.ids[1]);
  const { parent, outDir, text } = await exportTo(ctx);
  try {
    const lines = text.split("\n");
    const counts = lines.findIndex((l) => l.includes("needs re-upload by the photographer:"));
    const other = lines.findIndex((l) => l.includes("bad_payload:"));
    assert.ok(counts > -1 && other > counts, "needs re-upload is counted before other reasons");
    const lists = lines.filter((l) => /\(\d+\): /.test(l));
    assert.match(lists[0], /^needs re-upload by the photographer \(1\): /);
    assert.deepEqual(await readdir(outDir), [MANIFEST_FILE, STATE_FILE].sort());
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("a photo missing from storage is skipped as missing_image", async () => {
  const ctx = await setup(2);
  ctx.store.delete(ctx.keyOf(ctx.ids[0]));
  const { parent, result, text } = await exportTo(ctx);
  try {
    assert.equal(result.exitCode, EXIT.ok);
    assert.equal(result.summary.exported, 1);
    assert.match(text, new RegExp(`missing_image \\(1\\): ${ctx.ids[0]}`));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("a photo that does not match its stored digest is skipped and its file removed", async () => {
  const ctx = await setup(2);
  ctx.store.set(ctx.keyOf(ctx.ids[0]), jpeg(99));
  const { parent, outDir, result } = await exportTo(ctx);
  try {
    assert.equal(result.summary.exported, 1);
    assert.deepEqual(result.summary.counts.map((c) => c.reason), ["digest_mismatch"]);
    const files = (await readdir(outDir)).filter((f) => f.endsWith(".jpg"));
    assert.deepEqual(files, [`${ctx.ids[1]}.jpg`]);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("a storage failure gives read_error and exit 3, still writes the rest, and prints only the status", async () => {
  const ctx = await setup(2);
  ctx.failing.add(ctx.keyOf(ctx.ids[0]));
  const { parent, outDir, result, text } = await exportTo(ctx);
  try {
    assert.equal(result.exitCode, EXIT.readErrors);
    assert.equal(result.summary.exported, 1);
    assert.match(text, /Photo storage read failed \(status 503\)/);
    assert.ok(!text.includes("boom with a secret"));
    assert.match(text, new RegExp(`read_error \\(1\\): ${ctx.ids[0]}`));
    assert.ok(existsSync(path.join(outDir, MANIFEST_FILE)));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("manifest.json is written last, after every photo and the state file", async () => {
  const ctx = await setup(2);
  const parent = await temp();
  const outDir = path.join(parent, "bundle");
  let atBuild;
  try {
    const result = await runExport({
      source: ctx.source,
      outDir,
      project: PROJECT,
      now: now(),
      log: () => undefined,
      build: (entries) => {
        atBuild = { manifest: existsSync(path.join(outDir, MANIFEST_FILE)), photos: ctx.ids.every((id) => existsSync(path.join(outDir, `${id}.jpg`))) };
        return buildManifest(entries);
      },
    });
    assert.equal(result.exitCode, EXIT.ok);
    assert.deepEqual(atBuild, { manifest: false, photos: true });
    assert.deepEqual((await readdir(outDir)).filter((f) => f.endsWith(".json")).sort(), [MANIFEST_FILE, STATE_FILE].sort());
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("when buildManifest throws, the run fails and no manifest is written", async () => {
  const ctx = await setup(2);
  const parent = await temp();
  const outDir = path.join(parent, "bundle");
  try {
    await assert.rejects(
      runExport({
        source: ctx.source,
        outDir,
        project: PROJECT,
        now: now(),
        log: () => undefined,
        build: () => {
          throw new Error("the backend would refuse this");
        },
      }),
      /would refuse/,
    );
    assert.ok(!existsSync(path.join(outDir, MANIFEST_FILE)));
    assert.equal(ctx.opened.closed, 1, "the source is closed on failure");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("two ids differing only in case never produce a manifest", async () => {
  const ctx = await setup(2);
  // On a case-insensitive disk the second write collides (EEXIST); elsewhere buildManifest refuses. Either way: no manifest.
  for (const [oldId, newId] of [[ctx.ids[0], "photo-a"], [ctx.ids[1], "PHOTO-A"]]) {
    const oldKey = ctx.keyOf(oldId);
    const newKey = `submissions/${newId}/${oldKey.split("/")[2]}`;
    ctx.store.set(newKey, ctx.store.get(oldKey));
    ctx.db.sqlite.prepare("UPDATE submissions SET id = ?, image_key = ? WHERE id = ?").run(newId, newKey, oldId);
  }
  const parent = await temp();
  const outDir = path.join(parent, "bundle");
  try {
    await assert.rejects(runExport({ source: ctx.source, outDir, project: PROJECT, now: now(), log: () => undefined }));
    assert.ok(!existsSync(path.join(outDir, MANIFEST_FILE)));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("output folder refusals exit 2 before the source is opened", async () => {
  const ctx = await setup(1);
  const opened = [];
  const source = async () => {
    opened.push(true);
    return ctx.source;
  };
  const run = (outDir) => runExport({ source, outDir, project: PROJECT, now: now(), log: () => undefined });
  const parent = await temp();
  const notIgnored = path.join(REPO_ROOT, `export-test-not-ignored-${Date.now()}`);
  try {
    const full = path.join(parent, "full");
    await mkdir(full);
    await writeFile(path.join(full, "keep.txt"), "x");
    const refusals = [
      [full, /not empty/],
      [notIgnored, /not git-ignored/],
      [path.join(parent, "no", "such", "parent", "bundle"), /parent folder/],
      [path.join(full, "keep.txt"), /not a folder|not empty|parent/],
    ];
    for (const [dir, pattern] of refusals) {
      const result = await run(dir);
      assert.equal(result.exitCode, EXIT.refused, dir);
      assert.match(result.message, pattern);
    }
    assert.deepEqual(opened, [], "no source was opened");
    assert.ok(!existsSync(notIgnored), "a refused folder is not created");
    assert.deepEqual(await readdir(full), ["keep.txt"]);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("an existing empty folder and a git-ignored folder inside the repo are accepted", async () => {
  const ctx = await setup(1);
  const parent = await temp();
  const empty = path.join(parent, "empty");
  const ignored = path.join(REPO_ROOT, "outputs", "media-export", `test-${Date.now()}`);
  const quiet = () => undefined;
  try {
    await mkdir(empty);
    await mkdir(path.dirname(ignored), { recursive: true });
    const viaEmpty = await runExport({ source: ctx.source, outDir: empty, project: PROJECT, now: now(), log: quiet });
    assert.equal(viaEmpty.exitCode, EXIT.ok, viaEmpty.message);
    assert.ok(existsSync(path.join(empty, MANIFEST_FILE)));

    const first = await runExport({ source: ctx.source, outDir: ignored, project: PROJECT, now: now(), log: quiet });
    assert.equal(first.exitCode, EXIT.ok, first.message);
    assert.ok(existsSync(path.join(ignored, MANIFEST_FILE)));
    const again = await runExport({ source: ctx.source, outDir: ignored, project: PROJECT, now: now(), log: quiet });
    assert.equal(again.exitCode, EXIT.refused, "a second export into the same folder is refused");
  } finally {
    await rm(ignored, { recursive: true, force: true });
    await rm(parent, { recursive: true, force: true });
  }
});

test("a source that refuses (no local state) exits 2 and creates no folder", async () => {
  const parent = await temp();
  const outDir = path.join(parent, "bundle");
  try {
    const result = await runExport({
      source: async () => {
        throw new Refusal("No local database found.");
      },
      outDir,
      project: PROJECT,
      now: now(),
      log: () => undefined,
    });
    assert.equal(result.exitCode, EXIT.refused);
    assert.ok(!existsSync(outDir));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("verify passes when nothing changed and fails after a staff review changes a row", async () => {
  const ctx = await setup(2);
  const { parent, outDir } = await exportTo(ctx);
  try {
    const lines = [];
    const clean = await runVerify({ source: ctx.source, bundleDir: outDir, log: (l) => lines.push(l) });
    assert.equal(clean.exitCode, EXIT.ok);

    const checks = { rights: true, identity: true, quality: true, privacy: true, safety: true };
    await reviewSubmission(ctx.db, STAFF, ctx.ids[0], { status: "changes_requested", note: "Please add the location.", checks, version: 1 });
    const drifted = await runVerify({ source: ctx.source, bundleDir: outDir, log: (l) => lines.push(l) });
    assert.equal(drifted.exitCode, EXIT.drift);
    assert.match(lines.join("\n"), new RegExp(`changed \\(1\\): ${ctx.ids[0]}`));

    ctx.db.sqlite.prepare("DELETE FROM submissions WHERE id = ?").run(ctx.ids[1]);
    const missing = await runVerify({ source: ctx.source, bundleDir: outDir, log: (l) => lines.push(l) });
    assert.equal(missing.exitCode, EXIT.drift);
    assert.match(lines.join("\n"), new RegExp(`missing \\(1\\): ${ctx.ids[1]}`));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("verify refuses a folder without a readable state file", async () => {
  const ctx = await setup(1);
  const parent = await temp();
  try {
    const none = await runVerify({ source: ctx.source, bundleDir: parent, log: () => undefined });
    assert.equal(none.exitCode, EXIT.refused);
    await writeFile(path.join(parent, STATE_FILE), '{"not":"a list"}');
    const bad = await runVerify({ source: ctx.source, bundleDir: parent, log: () => undefined });
    assert.equal(bad.exitCode, EXIT.refused);
    assert.equal(ctx.opened.rows, 1, "only the damaged-state case reached the database");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("arguments: --out, --verify, defaults per source", () => {
  assert.deepEqual(parseArgs(["--out", "x"]), { ok: true, mode: "out", dir: "x", remote: false, project: "demo-airplane-games", persistTo: undefined });
  assert.deepEqual(parseArgs(["--out", "x", "--remote"]), { ok: true, mode: "out", dir: "x", remote: true, project: "airplane-games-auth-20261022", persistTo: undefined });
  assert.deepEqual(parseArgs(["--verify", "b", "--persist-to", "s"]), { ok: true, mode: "verify", dir: "b", remote: false, project: "demo-airplane-games", persistTo: "s" });
  assert.equal(parseArgs(["--out", "x", "--project", "p1"]).project, "p1");
});

test("arguments: refusals before anything is read", () => {
  const bad = [
    [["--out", "x", "--bogus"], /bogus|Unknown/i],
    [["--out", "x", "positional"], /positional/i],
    [[], /--out.*--verify/],
    [["--remote"], /--out.*--verify/],
    [["--project", "p"], /--out.*--verify/],
    [["--out", "x", "--verify", "y"], /either/],
    [["--out", "x", "--remote", "--persist-to", "d"], /persist-to/],
    [["--verify", "b", "--project", "p"], /project/],
    [["--out"], /argument missing|value|--out/i],
    [["--out", " "], /empty/],
  ];
  for (const [argv, pattern] of bad) {
    const parsed = parseArgs(argv);
    assert.equal(parsed.ok, false, argv.join(" "));
    assert.match(parsed.error, pattern, argv.join(" "));
  }
});

test("local source: the expected files are named as Miniflare names them, and absent state is refused", async () => {
  // The id derivation matches the file the dev server already created for the vite.config.ts database id.
  assert.equal(objectFileName("miniflare-D1DatabaseObject", LOCAL_D1_ID), "faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite");
  assert.equal(objectFileName("miniflare-R2BucketObject", LOCAL_R2_BUCKET), "49e6826fd41b4990fd0dd7b3ba19a3021a358ffb618ea1ab8f4454a592996ae7.sqlite");
  const paths = localStatePaths(path.join("some", "state"));
  assert.ok(paths.d1File.endsWith(path.join("v3", "d1", "miniflare-D1DatabaseObject", objectFileName("miniflare-D1DatabaseObject", LOCAL_D1_ID))));

  const empty = await temp();
  try {
    await assert.rejects(localSource({ persistTo: empty }), (e) => e instanceof Refusal && /No local database/.test(e.message));
    // A D1 file alone is not enough: an absent R2 database would be created empty and every photo would look missing.
    const { d1File } = localStatePaths(empty);
    await mkdir(path.dirname(d1File), { recursive: true });
    await writeFile(d1File, "");
    await assert.rejects(localSource({ persistTo: empty }), (e) => e instanceof Refusal && /photo storage/.test(e.message));
    assert.deepEqual((await readdir(path.dirname(d1File))).length, 1, "nothing was created by the refusal");
  } finally {
    await rm(empty, { recursive: true, force: true });
  }
});

test("readCapped reads at most cap+1 bytes and cancels the stream", async () => {
  let cancelled = false;
  let pulled = 0;
  const stream = new ReadableStream({
    pull(controller) {
      pulled += 1;
      controller.enqueue(new Uint8Array(4).fill(7));
    },
    cancel() {
      cancelled = true;
    },
  });
  const bytes = await readCapped(stream, 10);
  assert.equal(bytes.length, 11);
  assert.ok(cancelled);
  assert.ok(pulled < 10, "an endless object is not read to the end");
  const small = await readCapped(new Response(new Uint8Array([1, 2, 3])).body, 10);
  assert.deepEqual([...small], [1, 2, 3]);
});

test("a folder name starting with two dots inside the repo is still checked against git-ignore", async () => {
  const ctx = await setup(1);
  const dotted = path.join(REPO_ROOT, `..x-${Date.now()}`);
  try {
    const result = await runExport({ source: ctx.source, outDir: dotted, project: PROJECT, now: now(), log: () => undefined });
    assert.equal(result.exitCode, EXIT.refused);
    assert.match(result.message, /not git-ignored/);
    assert.ok(!existsSync(dotted));
  } finally {
    await rm(dotted, { recursive: true, force: true });
  }
});

test("a failed run removes the private photos it wrote, and the folder only if it made it", async () => {
  const boom = () => {
    throw new Error("the backend would refuse this");
  };
  for (const preexisting of [false, true]) {
    const ctx = await setup(2);
    const parent = await temp();
    const outDir = path.join(parent, "bundle");
    if (preexisting) await mkdir(outDir);
    const lines = [];
    try {
      await assert.rejects(runExport({ source: ctx.source, outDir, project: PROJECT, now: now(), log: (l) => lines.push(l), build: boom }), /would refuse/);
      assert.equal(existsSync(outDir), preexisting);
      if (preexisting) assert.deepEqual(await readdir(outDir), []);
      assert.match(lines.join("\n"), /Removed the 2 file\(s\)/);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  }
});

test("a source whose ready() refuses exits 2 with no folder; other ready() errors fail with exit-1 semantics", async () => {
  const ctx = await setup(1);
  const parent = await temp();
  const outDir = path.join(parent, "bundle");
  const withReady = (error) => ({ ...ctx.source, ready: async () => void (() => { throw error; })() });
  try {
    const refused = await runExport({
      source: withReady(Object.assign(new Error("The photo storage password is blank."), { refusal: true })),
      outDir,
      project: PROJECT,
      now: now(),
      log: () => undefined,
    });
    assert.equal(refused.exitCode, EXIT.refused);
    assert.match(refused.message, /password is blank/);
    assert.ok(!existsSync(outDir));
    await assert.rejects(runExport({ source: withReady(new Error("wrangler crashed")), outDir, project: PROJECT, now: now(), log: () => undefined }), /wrangler crashed/);
    assert.ok(!existsSync(outDir));
    const verify = await runVerify({ source: withReady(Object.assign(new Error("D1 id mismatch"), { refusal: true })), bundleDir: await temp().then(async (d) => (await writeFile(path.join(d, STATE_FILE), "[]"), d)), log: () => undefined });
    assert.equal(verify.exitCode, EXIT.refused);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("read_error lines show the storage status when the error has one", async () => {
  const ctx = await setup(1);
  ctx.failing.add(ctx.keyOf(ctx.ids[0]));
  const { parent, text } = await exportTo(ctx);
  try {
    assert.match(text, /Photo storage read failed \(status 503\)/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("the local source exports end to end from a real Miniflare state folder", async () => {
  const state = await temp();
  const parent = await temp();
  const id = crypto.randomUUID();
  const key = `submissions/${id}/${crypto.randomUUID()}`;
  const bytes = jpeg(42);
  const mf = new Miniflare({
    log: new Log(LogLevel.NONE),
    modules: true,
    script: "export default { fetch() { return new Response(null); } };",
    compatibilityDate: "2024-01-01",
    d1Databases: { DB: LOCAL_D1_ID },
    r2Buckets: { BUCKET: LOCAL_R2_BUCKET },
    d1Persist: path.join(state, "v3", "d1"),
    r2Persist: path.join(state, "v3", "r2"),
    cache: false,
  });
  try {
    const db = await mf.getD1Database("DB");
    const migration = readFileSync(new URL("../drizzle/0000_charming_spitfire.sql", import.meta.url), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) if (statement.trim()) await db.prepare(statement).run();
    const at = new Date().toISOString();
    await db
      .prepare(
        "INSERT INTO submissions (id,owner_id,request_key,payload,image_key,image_mime,image_bytes,width,height,digest,status,review_note,checks,version,last_mutation,created_at,updated_at) VALUES (?,?,?,?,?,'image/jpeg',?,1200,800,?,'pending','','{}',1,?,?,?)",
      )
      .bind(id, OWNER, `${OWNER}:k`, JSON.stringify(submissionData()), key, bytes.length, sha256Hex(bytes), "m1", at, at)
      .run();
    await (await mf.getR2Bucket("BUCKET")).put(key, bytes);
  } finally {
    await mf.dispose();
  }
  try {
    const outDir = path.join(parent, "bundle");
    const result = await runExport({ source: () => localSource({ persistTo: state }), outDir, project: PROJECT, now: now(), log: () => undefined });
    assert.equal(result.exitCode, EXIT.ok, result.message);
    const manifest = parseManifest(await readFile(path.join(outDir, MANIFEST_FILE), "utf8"));
    assert.equal(manifest.manifest.entries.length, 1);
    const [entry] = manifest.manifest.entries;
    assert.equal(entry.sourceId, id);
    assert.equal(entry.sha256, sha256Hex(bytes));
    assert.equal(sha256Hex(await readFile(path.join(outDir, entry.file))), entry.sha256);
  } finally {
    await rm(state, { recursive: true, force: true });
    await rm(parent, { recursive: true, force: true });
  }
});
