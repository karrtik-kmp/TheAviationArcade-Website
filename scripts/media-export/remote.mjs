/**
 * Remote (live D1 + Bunny) source for the D1 media export. READ-ONLY by construction:
 *  - D1: only the two SQL constants from lib/submissions/export.ts can be sent (`wrangler d1 execute --remote`).
 *  - Bunny: BunnyPhotoStorage gets a fetcher that rejects every method except GET, and only `readImage` is exposed.
 * Wrangler's and Bunny's raw output is captured and never echoed: every error here has a generic message.
 * Nothing in this wave runs this module against live services; the tests use injected fakes.
 */
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BunnyPhotoStorage, BunnyStorageError } from "../../lib/bunny-storage.ts";
import { EXPORT_SQL, MAX_IMAGE_BYTES, VERIFY_SQL } from "../../lib/submissions/export.ts";
import { readCloudflareLocalSettings } from "../cloudflare-local-settings.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const KEY_PATTERN = /^submissions\/[a-zA-Z0-9-]{1,80}\/[0-9a-f-]{36}$/;
const ALLOWED_SQL = new Set([EXPORT_SQL, VERIFY_SQL]);
const WRANGLER_TIMEOUT_MS = 120_000;
const WRANGLER_MAX_BUFFER = 256 * 1024 * 1024;

/** Message of every storage read failure. `status` 0 means "no HTTP status" (network, timeout, broken stream). */
export const storageReadError = (status) => Object.assign(new Error(`Photo storage read failed (status ${status})`), { status });

/** An error the CLI should report as a refusal (nothing was read or written). */
const refusal = (message) => Object.assign(new Error(message), { refusal: true });

/** A fetcher that passes GET (the only call a read needs) to `inner` and rejects anything else without calling it. */
export function readOnlyFetcher(inner) {
  return async (request) => {
    if (request?.method !== "GET") throw new Error("Refused: photo storage is read-only in this export.");
    return inner(request);
  };
}

/** The real storage class over the read-only fetcher. Keep it inside this module; callers only get `readImage`. */
export function buildReadOnlyStorage(config, innerFetch = fetch) {
  return new BunnyPhotoStorage(config, readOnlyFetcher(innerFetch));
}

/** Reads at most `cap` bytes of the stream, then cancels the rest. */
async function readCapped(body, cap) {
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (total < cap) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Cancelling must not hide the result.
    }
  }
  const out = new Uint8Array(Math.min(total, cap));
  let offset = 0;
  for (const chunk of chunks) {
    const piece = chunk.subarray(0, out.length - offset);
    out.set(piece, offset);
    offset += piece.length;
    if (offset >= out.length) break;
  }
  return out;
}

/** The single read-only operation the bundle needs: the capped bytes of one stored photo, or null when absent. */
export function makeReadImage(storage) {
  return async function readImage(key) {
    if (typeof key !== "string" || !KEY_PATTERN.test(key)) throw new Error("Refused: not a submission photo key.");
    let object;
    try {
      object = await storage.get(key);
    } catch (error) {
      throw storageReadError(error instanceof BunnyStorageError ? error.status : 0);
    }
    if (object === null) return null;
    try {
      return await readCapped(object.body, MAX_IMAGE_BYTES + 1);
    } catch {
      throw storageReadError(0);
    }
  };
}

/** wrangler's `[{ results, success }]`. Anything else is a generic error; the raw text is never included. */
export function parseWranglerRows(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("The D1 read returned output that could not be parsed.");
  }
  const first = Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : null;
  if (!first || first.success !== true || !Array.isArray(first.results)) throw new Error("The D1 read did not succeed.");
  if (!first.results.every((row) => row !== null && typeof row === "object" && !Array.isArray(row))) {
    throw new Error("The D1 read returned unexpected rows.");
  }
  return first.results;
}

function parseDatabaseUuid(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("The D1 database check returned output that could not be parsed.");
  }
  if (parsed === null || typeof parsed !== "object" || typeof parsed.uuid !== "string") {
    throw new Error("The D1 database check did not return a database id.");
  }
  return parsed.uuid;
}

const readJson = async (relative) => JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));

/**
 * @param {object} options
 * @param {string} options.project Firebase project the owners must belong to (checked by the caller's planEntry).
 * Injectables (tests): `target` (config/cloudflare-prototype.json), `settings` (.dev.vars.cloudflare values),
 * `spawn(command, args, options) -> { status, stdout, stderr, error }`, `fetcher` (the network under the Bunny guard).
 * Nothing is read or sent until `rows` or `readImage` is first called.
 */
export function remoteSource({ project, images = true, target, settings, spawn = spawnSync, fetcher = fetch, cwd = root } = {}) {
  if (typeof project !== "string" || project.trim() === "") throw new Error("A Firebase project id is required.");
  let targetPromise;
  const getTarget = () => (targetPromise ??= target ? Promise.resolve(target) : readJson("../../config/cloudflare-prototype.json"));

  function wrangler(args, accountId) {
    return Promise.resolve(
      spawn(
        process.execPath,
        ["--import", "./scripts/sites-env.mjs", path.join("node_modules", "wrangler", "bin", "wrangler.js"), ...args],
        {
          cwd,
          env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId },
          stdio: ["ignore", "pipe", "pipe"],
          encoding: "utf8",
          windowsHide: true,
          timeout: WRANGLER_TIMEOUT_MS,
          maxBuffer: WRANGLER_MAX_BUFFER,
        },
      ),
    ).then((result) => {
      if (!result || result.error || result.status !== 0 || typeof result.stdout !== "string") {
        throw new Error("The wrangler D1 command failed. Output was not printed; check the Cloudflare login and run it by hand.");
      }
      return result.stdout;
    });
  }

  // wrangler resolves the database by name through the Cloudflare account (no config file needed); the id check below
  // pins that name to the recorded database before any query is sent. Verified in wrangler's d1/utils getDatabaseByNameOrBinding.
  let verified;
  const verifyDatabase = () =>
    (verified ??= (async () => {
      const t = await getTarget();
      if (!t?.accountId || !t?.database?.name || !t?.database?.id) throw refusal("The recorded Cloudflare target is incomplete.");
      const uuid = parseDatabaseUuid(await wrangler(["d1", "info", t.database.name, "--json"], t.accountId));
      if (uuid !== t.database.id) throw refusal("Refused: the D1 database id differs from config/cloudflare-prototype.json.");
      return t;
    })());

  let reader;
  const getReader = () =>
    (reader ??= (async () => {
      const t = await getTarget();
      const secrets = settings ?? (await readCloudflareLocalSettings());
      const password = secrets?.BUNNY_STORAGE_PASSWORD;
      if (typeof password !== "string" || password.trim() === "") {
        throw refusal("Fill BUNNY_STORAGE_PASSWORD in .dev.vars.cloudflare. No request was sent.");
      }
      return makeReadImage(buildReadOnlyStorage({ ...t.photoStorage, password }, fetcher));
    })());

  return {
    /** Fails at open, before any output exists: the D1 id check, and (with images) the Bunny password. */
    async ready() {
      await verifyDatabase();
      if (images) await getReader();
    },
    async rows(sql) {
      if (typeof sql !== "string" || !ALLOWED_SQL.has(sql)) throw new Error("Refused: only the export's own read queries may run.");
      const t = await verifyDatabase();
      return parseWranglerRows(await wrangler(["d1", "execute", t.database.name, "--remote", "--json", "--command", sql], t.accountId));
    },
    async readImage(key) {
      return (await getReader())(key);
    },
    async close() {},
  };
}
