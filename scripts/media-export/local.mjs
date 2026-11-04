// The local source of the D1 -> backend photo export: the dev server's D1 and R2 state, opened in-process with
// Miniflare (no network, nothing written to the data). Stop `npm run dev` first; two processes must not share it.
import { createHash, createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Log, LogLevel, Miniflare } from "miniflare";
import { MAX_IMAGE_BYTES } from "../../lib/submissions/export.ts";
import { Refusal } from "./bundle.mjs";

// The local binding ids from vite.config.ts (SITE_CREATOR_PLACEHOLDER_DATABASE_ID, bucket_name "site-creator-r2").
export const LOCAL_D1_ID = "00000000-0000-4000-8000-000000000000";
export const LOCAL_R2_BUCKET = "site-creator-r2";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
/** `npm run start` and the Vite plugin persist under .wrangler/state; Wrangler adds `v3/<service>`. */
export const DEFAULT_PERSIST_TO = path.join(repoRoot, ".wrangler", "state");

/**
 * Miniflare keeps one sqlite file per Durable Object, named by its derived id (miniflare
 * durableObjectNamespaceIdFromName, v4.20260515): hex(HMAC(key, name)[0..16] + HMAC(key, that)[0..16]) with
 * key = sha256(uniqueKey). Miniflare would silently create an empty database for a wrong id, so we check the file.
 */
export function objectFileName(uniqueKey, name) {
  const key = createHash("sha256").update(uniqueKey).digest();
  const nameHmac = createHmac("sha256", key).update(name).digest().subarray(0, 16);
  const hmac = createHmac("sha256", key).update(nameHmac).digest().subarray(0, 16);
  return `${Buffer.concat([nameHmac, hmac]).toString("hex")}.sqlite`;
}

export function localStatePaths(persistTo) {
  const root = path.resolve(persistTo);
  const d1 = path.join(root, "v3", "d1");
  const r2 = path.join(root, "v3", "r2");
  return {
    d1,
    r2,
    d1File: path.join(d1, "miniflare-D1DatabaseObject", objectFileName("miniflare-D1DatabaseObject", LOCAL_D1_ID)),
    r2File: path.join(r2, "miniflare-R2BucketObject", objectFileName("miniflare-R2BucketObject", LOCAL_R2_BUCKET)),
  };
}

/** Reads at most cap+1 bytes of a stream, then cancels it, so an oversized object is never fully loaded. */
export async function readCapped(stream, cap = MAX_IMAGE_BYTES) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (total <= cap) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    if (total > cap) await reader.cancel();
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(Math.min(total, cap + 1));
  let offset = 0;
  for (const chunk of chunks) {
    const room = out.length - offset;
    if (room <= 0) break;
    out.set(chunk.length > room ? chunk.subarray(0, room) : chunk, offset);
    offset += Math.min(chunk.length, room);
  }
  return out;
}

/** `{ rows(sql), readImage(key), close() }` over the local D1 and R2 state. Throws Refusal when the state is absent. */
export async function localSource({ persistTo = DEFAULT_PERSIST_TO } = {}) {
  const paths = localStatePaths(persistTo);
  if (!existsSync(paths.d1File)) {
    throw new Refusal(`No local database found at ${paths.d1File}. Run the dev server once (and stop it), or pass --persist-to <state dir>.`);
  }
  if (!existsSync(paths.r2File)) {
    throw new Refusal(`No local photo storage found at ${paths.r2File}. Nothing would be read; pass --persist-to <state dir>.`);
  }
  const mf = new Miniflare({
    log: new Log(LogLevel.NONE),
    modules: true,
    script: "export default { fetch() { return new Response(null, { status: 204 }); } };",
    compatibilityDate: "2024-01-01",
    d1Databases: { DB: LOCAL_D1_ID },
    r2Buckets: { BUCKET: LOCAL_R2_BUCKET },
    d1Persist: paths.d1,
    r2Persist: paths.r2,
    cache: false,
  });
  try {
    const db = await mf.getD1Database("DB");
    const bucket = await mf.getR2Bucket("BUCKET");
    return {
      async rows(sql) {
        const { results } = await db.prepare(sql).all();
        return results;
      },
      async readImage(key) {
        const object = await bucket.get(key);
        if (object === null) return null;
        return readCapped(object.body);
      },
      async close() {
        await mf.dispose();
      },
    };
  } catch (error) {
    await mf.dispose().catch(() => undefined);
    throw error;
  }
}
