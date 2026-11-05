/**
 * Server settings. Server code reads its configuration only through `setting()`, which reads the process
 * environment: the hosted server passes it with `node --env-file=...`, and `npm run dev` copies `.dev.vars`
 * into it (vite.config.ts). Server-only.
 */

/**
 * Every setting the server reads. Keep in step with web.env.example. A value that is not a string reads
 * as unset.
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
  "SITE_SURFACE",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** The raw setting, or undefined when it is unset. */
export function setting(key: SettingKey): string | undefined {
  const value = process.env[key];
  return typeof value === "string" ? value : undefined;
}
