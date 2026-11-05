/**
 * The Node server adapter: settings come from the process environment (the server passes them with
 * `node --env-file=...`). There is no D1 and no R2 on the server, so both are always null and the
 * routes that still need them answer 503 until their desk is on the backend.
 */
import type { ServerRuntime } from "./types.ts";

export const runtime = {
  name: "node",
  setting(key) {
    const value = process.env[key];
    return typeof value === "string" ? value : undefined;
  },
  d1: () => null,
  r2Bucket: () => null,
} satisfies ServerRuntime as ServerRuntime;
