import assert from "node:assert/strict";
import test from "node:test";
import { EXPORT_SQL, MAX_IMAGE_BYTES, VERIFY_SQL } from "../lib/submissions/export.ts";
import { buildReadOnlyStorage, parseWranglerRows, remoteSource } from "../scripts/media-export/remote.mjs";

const target = {
  name: "aviation-arcade-website",
  accountId: "acct-123",
  database: { name: "aviation-arcade-website", id: "11111111-1111-4111-8111-111111111111" },
  photoStorage: { zone: "aviation-arcade-website", region: "de", endpoint: "https://de-s3.storage.bunnycdn.com" },
};
const KEY = "submissions/abc-123/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const SECRET_OUT = "SECRET-STDOUT-DO-NOT-LEAK";

function fakeSpawn({ uuid = target.database.id, execute = [{ success: true, results: [{ id: "a" }] }], status = 0, rawExecute } = {}) {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    const isInfo = args.includes("info");
    const stdout = isInfo ? JSON.stringify({ uuid }) : (rawExecute ?? JSON.stringify(execute));
    return { status, stdout, stderr: `stderr ${SECRET_OUT}`, error: undefined };
  };
  return { spawn, calls };
}

function neverFetch() {
  const calls = [];
  const fetcher = async (request) => {
    calls.push(request);
    throw new Error("network must not be reached");
  };
  return { fetcher, calls };
}

const source = (extra = {}) => remoteSource({ project: "p", target, settings: { BUNNY_STORAGE_PASSWORD: "pw" }, ...extra });

test("guarded storage: PUT and DELETE throw without the network being touched", async () => {
  const { fetcher, calls } = neverFetch();
  const storage = buildReadOnlyStorage({ ...target.photoStorage, password: "pw" }, fetcher);
  await assert.rejects(storage.put(KEY, new Uint8Array([1]), { httpMetadata: { contentType: "image/png" } }), /read-only/);
  await assert.rejects(storage.delete(KEY), /read-only/);
  assert.equal(calls.length, 0);
});

test("readImage refuses bad keys without any fetch", async () => {
  const { fetcher, calls } = neverFetch();
  const s = source({ fetcher });
  for (const bad of [
    "setup-checks/abc/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    "submissions/../x/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    "submissions/abc/short",
    "submissions/abc/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/extra",
    `submissions/${"a".repeat(81)}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee`,
    "",
    undefined,
  ]) {
    await assert.rejects(s.readImage(bad), /Refused/);
  }
  assert.equal(calls.length, 0);
});

test("an empty or missing password refuses before any request", async () => {
  const { fetcher, calls } = neverFetch();
  for (const settings of [{}, { BUNNY_STORAGE_PASSWORD: "   " }]) {
    await assert.rejects(remoteSource({ project: "p", target, settings, fetcher }).readImage(KEY), /BUNNY_STORAGE_PASSWORD/);
  }
  assert.equal(calls.length, 0);
});

test("readImage sends only a GET and returns the bytes", async () => {
  const seen = [];
  const fetcher = async (request) => {
    seen.push(request.method);
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, 1]));
  };
  assert.deepEqual([...(await source({ fetcher }).readImage(KEY))], [0xff, 0xd8, 0xff, 1]);
  assert.deepEqual(seen, ["GET"]);
});

test("readImage caps the read at MAX_IMAGE_BYTES + 1 and cancels the rest", async () => {
  let cancelled = false;
  let pulled = 0;
  const chunk = new Uint8Array(1024 * 1024);
  const body = new ReadableStream({
    pull(controller) {
      pulled += 1;
      controller.enqueue(chunk);
    },
    cancel() {
      cancelled = true;
    },
  });
  const fetcher = async () => new Response(body);
  const bytes = await source({ fetcher }).readImage(KEY);
  assert.equal(bytes.length, MAX_IMAGE_BYTES + 1);
  assert.equal(cancelled, true);
  assert.ok(pulled <= 8, `pulled ${pulled} chunks of an unbounded stream`);
});

test("a 404 returns null", async () => {
  const fetcher = async () => new Response("nope", { status: 404 });
  assert.equal(await source({ fetcher }).readImage(KEY), null);
});

test("other failures throw only the status message", async () => {
  const fetcher = async () => new Response(`body ${SECRET_OUT}`, { status: 503 });
  await assert.rejects(source({ fetcher }).readImage(KEY), (error) => {
    assert.equal(error.message, "Photo storage read failed (status 503)");
    return true;
  });
  const broken = async () => {
    throw new Error(`connect ECONNRESET ${SECRET_OUT}`);
  };
  await assert.rejects(source({ fetcher: broken }).readImage(KEY), (error) => {
    assert.equal(error.message, "Photo storage read failed (status 0)");
    return true;
  });
});

test("wrangler JSON: success returns rows", () => {
  assert.deepEqual(parseWranglerRows(JSON.stringify([{ success: true, results: [{ a: 1 }], meta: {} }])), [{ a: 1 }]);
  assert.deepEqual(parseWranglerRows(JSON.stringify([{ success: true, results: [] }])), []);
});

test("wrangler JSON: success:false, garbage and wrong shapes are generic errors without the output", () => {
  for (const raw of [
    JSON.stringify([{ success: false, results: [], error: SECRET_OUT }]),
    `not json ${SECRET_OUT}`,
    JSON.stringify({ success: true, results: [] }),
    JSON.stringify([{ success: true, results: "x" }]),
    JSON.stringify([{ success: true, results: [1] }]),
    JSON.stringify([]),
  ]) {
    assert.throws(
      () => parseWranglerRows(raw),
      (error) => !error.message.includes(SECRET_OUT) && !error.message.includes("not json"),
    );
  }
});

test("rows: checks the database id, then runs the constant SQL as a captured, non-inherited wrangler call", async () => {
  const { spawn, calls } = fakeSpawn();
  const s = source({ spawn });
  assert.deepEqual(await s.rows(EXPORT_SQL), [{ id: "a" }]);
  assert.deepEqual(await s.rows(VERIFY_SQL), [{ id: "a" }]);
  assert.equal(calls.length, 3, "one d1 info, then two executes");
  const [info, exec] = calls;
  assert.equal(info.command, process.execPath);
  assert.deepEqual(info.args.slice(0, 2), ["--import", "./scripts/sites-env.mjs"]);
  assert.match(info.args[2], /wrangler[\\/]bin[\\/]wrangler\.js$/);
  assert.deepEqual(info.args.slice(3), ["d1", "info", target.database.name, "--json"]);
  assert.deepEqual(exec.args.slice(3), ["d1", "execute", target.database.name, "--remote", "--json", "--command", EXPORT_SQL]);
  for (const call of calls) {
    assert.equal(call.options.env.CLOUDFLARE_ACCOUNT_ID, target.accountId);
    assert.deepEqual(call.options.stdio, ["ignore", "pipe", "pipe"]);
    assert.ok(!call.args.includes("--config"));
  }
});

test("a database id mismatch is refused and no query runs", async () => {
  const { spawn, calls } = fakeSpawn({ uuid: "22222222-2222-4222-8222-222222222222" });
  await assert.rejects(source({ spawn }).rows(EXPORT_SQL), /database id differs/);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].args.includes("info"));
});

test("SQL other than the two constants is refused before wrangler runs", async () => {
  const { spawn, calls } = fakeSpawn();
  const s = source({ spawn });
  for (const sql of ["DELETE FROM submissions", "SELECT * FROM submissions", `${EXPORT_SQL} `, `${VERIFY_SQL}; DROP TABLE submissions`, "", undefined]) {
    await assert.rejects(s.rows(sql), /Refused/);
  }
  assert.equal(calls.length, 0);
});

test("wrangler failure and success:false never echo stdout or stderr", async () => {
  for (const opts of [{ status: 1 }, { execute: [{ success: false, results: [] }] }, { rawExecute: `garbage ${SECRET_OUT}` }]) {
    const { spawn } = fakeSpawn(opts);
    await assert.rejects(source({ spawn }).rows(EXPORT_SQL), (error) => !error.message.includes(SECRET_OUT));
  }
  const thrown = { spawn: () => ({ status: null, error: new Error(SECRET_OUT), stdout: "", stderr: "" }) };
  await assert.rejects(source(thrown).rows(VERIFY_SQL), (error) => !error.message.includes(SECRET_OUT));
});

test("the source exposes only ready, rows, readImage and close", () => {
  assert.deepEqual(Object.keys(source()).sort(), ["close", "readImage", "ready", "rows"]);
});

test("read errors carry the HTTP status", async () => {
  for (const status of [401, 503]) {
    const fetcher = async () => new Response("x", { status });
    await assert.rejects(source({ fetcher }).readImage(KEY), (error) => error.status === status);
  }
  const broken = async () => {
    throw new Error("down");
  };
  await assert.rejects(source({ fetcher: broken }).readImage(KEY), (error) => error.status === 0);
});

test("ready refuses a blank password, as a refusal, before any request", async () => {
  const { spawn } = fakeSpawn();
  const { fetcher, calls } = neverFetch();
  for (const settings of [{}, { BUNNY_STORAGE_PASSWORD: " " }]) {
    await assert.rejects(remoteSource({ project: "p", target, settings, spawn, fetcher }).ready(), (error) => {
      assert.equal(error.refusal, true);
      assert.match(error.message, /BUNNY_STORAGE_PASSWORD in \.dev\.vars\.cloudflare/);
      return true;
    });
  }
  assert.equal(calls.length, 0);
});

test("ready refuses a uuid mismatch, as a refusal", async () => {
  const { spawn } = fakeSpawn({ uuid: "22222222-2222-4222-8222-222222222222" });
  await assert.rejects(source({ spawn }).ready(), (error) => error.refusal === true && /database id differs/.test(error.message));
});

test("ready runs the id check once and rows reuses it", async () => {
  const { spawn, calls } = fakeSpawn();
  const s = source({ spawn });
  await s.ready();
  await s.ready();
  await s.rows(VERIFY_SQL);
  assert.equal(calls.filter((c) => c.args.includes("info")).length, 1);
});

test("images:false never reads the settings", async () => {
  const { spawn } = fakeSpawn();
  const settings = new Proxy({}, { get() { throw new Error("settings were read"); } });
  const s = remoteSource({ project: "p", target, settings, images: false, spawn });
  await s.ready();
  assert.deepEqual(await s.rows(VERIFY_SQL), [{ id: "a" }]);
});
