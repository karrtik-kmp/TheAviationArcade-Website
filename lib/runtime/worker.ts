/** The Cloudflare Worker adapter: the only module that imports `cloudflare:workers`. */
import { env } from "cloudflare:workers";
import type { ServerRuntime } from "./types.ts";

const bindings = env as unknown as Record<string, unknown>;

export const runtime = {
  name: "worker",
  setting(key) {
    const value = bindings[key];
    return typeof value === "string" ? value : undefined;
  },
  d1: () => env.DB ?? null,
  r2Bucket: () => env.BUCKET ?? null,
} satisfies ServerRuntime as ServerRuntime;
