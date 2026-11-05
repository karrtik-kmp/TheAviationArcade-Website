/**
 * The server-environment port. Server code reads settings, the D1 database and the R2 bucket only
 * through `runtime` from `#runtime`, never from `cloudflare:workers` or `process.env` directly.
 *
 * `#runtime` is an explicit build alias with no fallback (vite.config.ts, tsconfig.json):
 * - `lib/runtime/worker.ts`: the Cloudflare Worker (bindings from `cloudflare:workers`).
 * - `lib/runtime/node.ts`: the Node server (settings from `process.env`, no D1, no R2).
 * A build that forgets the alias fails to resolve it rather than picking an adapter silently.
 */
import type { PhotoStorage } from "../photo-storage.ts";

/**
 * Every setting the server reads. Keep in step with cloudflare-env.d.ts. Every setting must be a string
 * (Worker vars, env-file values): a non-string reads as unset, which would, for example, stop the demo
 * account being recognized as demo.
 */
export const SETTING_KEYS = [
  "PHOTO_STORAGE_PROVIDER",
  "BUNNY_STORAGE_ZONE",
  "BUNNY_STORAGE_ENDPOINT",
  "BUNNY_STORAGE_REGION",
  "BUNNY_STORAGE_PASSWORD",
  "DEMO_ACCOUNT_UID",
  "DEMO_LOGIN_EMAIL",
  "DEMO_LOGIN_PASSWORD",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_WEB_API_KEY",
  "FIREBASE_AUTH_DOMAIN",
  "FIREBASE_APP_ID",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "GAME_API_BASE_URL",
  "ROLES_SOURCE",
  "MOCK_ADMIN_EMAILS",
  "MOCK_PHOTOGRAPHER_EMAILS",
  "PROGRESS_SOURCE",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export interface ServerRuntime {
  readonly name: "worker" | "node";
  /** The raw setting, or undefined when it is unset or not a string. */
  setting(key: SettingKey): string | undefined;
  /** The D1 binding, or null where there is none (always null on Node). */
  d1(): D1Database | null;
  /** The R2 photo bucket binding, or null where there is none (always null on Node). */
  r2Bucket(): PhotoStorage | null;
}
