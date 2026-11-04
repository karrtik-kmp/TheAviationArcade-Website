import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCloudflareLocalSettings } from "./cloudflare-local-settings.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "outputs/cloudflare-deploy");
const json = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const target = await json("config/cloudflare-prototype.json");
const built = await json("dist/server/wrangler.json");
const keys = ["FIREBASE_PROJECT_ID", "FIREBASE_WEB_API_KEY", "FIREBASE_AUTH_DOMAIN", "FIREBASE_APP_ID"];
const local = await readCloudflareLocalSettings();
const demoUid = local.DEMO_ACCOUNT_UID?.trim();
const demoEmail = local.DEMO_LOGIN_EMAIL?.trim();
const gameApiBaseUrl = local.GAME_API_BASE_URL?.trim();
// Roles: "backend" reads the game backend; anything else (the default) uses the mock email lists.
const rolesSource = local.ROLES_SOURCE?.trim().toLowerCase() === "backend" ? "backend" : "mock";
const emailList = (value) => (value ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
const mockAdmins = emailList(local.MOCK_ADMIN_EMAILS);
const mockPhotographers = emailList(local.MOCK_PHOTOGRAPHER_EMAILS);
const demoPassword = local.DEMO_LOGIN_PASSWORD;
if ((demoEmail || demoPassword) && (!demoUid || !demoEmail || !demoPassword))
  throw new Error("Demo login requires DEMO_ACCOUNT_UID, DEMO_LOGIN_EMAIL and DEMO_LOGIN_PASSWORD together.");
if (demoEmail && [...mockAdmins, ...mockPhotographers].includes(demoEmail.toLowerCase()))
  throw new Error("The shared demo login must not be on a mock role list.");
let provisioned = {};
try {
  provisioned = (await json("outputs/firebase-web-config.json")).runtimeBindings ?? {};
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const firebase = Object.fromEntries(keys.map((key) => [key, local[key]?.trim() || provisioned[key]]));
for (const [key, expected] of Object.entries({
  PHOTO_STORAGE_PROVIDER: "bunny",
  BUNNY_STORAGE_ZONE: target.photoStorage.zone,
  BUNNY_STORAGE_REGION: target.photoStorage.region,
  BUNNY_STORAGE_ENDPOINT: target.photoStorage.endpoint,
})) {
  if (local[key] && local[key] !== expected)
    throw new Error(`${key} differs from config/cloudflare-prototype.json; update the recorded target intentionally.`);
}
if (keys.some((key) => typeof firebase?.[key] !== "string" || !firebase[key].trim()) ||
    firebase.FIREBASE_PROJECT_ID !== "airplane-games-auth-20261022") {
  throw new Error("The recorded production Firebase Web App settings are missing or incorrect.");
}
await access(path.join(root, "dist/server/index.js"));
await access(path.join(root, "dist/client"));
const config = {
  name: target.name,
  account_id: target.accountId,
  main: "../../dist/server/index.js",
  compatibility_date: built.compatibility_date,
  compatibility_flags: built.compatibility_flags,
  no_bundle: true,
  find_additional_modules: true,
  rules: built.rules,
  assets: { directory: "../../dist/client" },
  d1_databases: [{ binding: "DB", database_name: target.database.name, database_id: target.database.id }],
  // Access is provisioned separately; this explicit target flag controls the workers.dev route.
  workers_dev: target.workersDev === true,
  preview_urls: false,
  observability: { enabled: true },
  vars: {
    ...(demoUid ? { DEMO_ACCOUNT_UID: demoUid } : {}),
    ...(gameApiBaseUrl ? { GAME_API_BASE_URL: gameApiBaseUrl } : {}),
    ROLES_SOURCE: rolesSource,
    ...Object.fromEntries(keys.map((key) => [key, firebase[key]])),
    PHOTO_STORAGE_PROVIDER: "bunny",
    BUNNY_STORAGE_ZONE: target.photoStorage.zone,
    BUNNY_STORAGE_REGION: target.photoStorage.region,
    BUNNY_STORAGE_ENDPOINT: target.photoStorage.endpoint,
  },
};
await mkdir(output, { recursive: true });
await writeFile(path.join(output, "wrangler.json"), JSON.stringify(config, null, 2) + "\n");
const secretsPath = path.join(root, "outputs/cloudflare-secrets.json");
// Always derive generated secrets from the current source, so clearing a local
// value cannot leave an old credential silently staged for a later upload.
await writeFile(secretsPath, JSON.stringify({
  BUNNY_STORAGE_PASSWORD: local.BUNNY_STORAGE_PASSWORD ?? "",
  // Mock role lists hold people's emails, so they travel as secrets. Empty when roles come from the backend.
  MOCK_ADMIN_EMAILS: rolesSource === "mock" ? mockAdmins.join(",") : "",
  MOCK_PHOTOGRAPHER_EMAILS: rolesSource === "mock" ? mockPhotographers.join(",") : "",
  ...(demoEmail && demoPassword ? { DEMO_LOGIN_EMAIL: demoEmail, DEMO_LOGIN_PASSWORD: demoPassword } : {}),
}, null, 2) + "\n", { mode: 0o600 });
// A plain `wrangler deploy` must use the same Bunny target as `npm run deploy`.
// The framework replaces this pointer on every build, so the portable build
// runner invokes this preparation only after the framework has finished.
await mkdir(path.join(root, ".wrangler/deploy"), { recursive: true });
await writeFile(path.join(root, ".wrangler/deploy/config.json"), JSON.stringify({
  configPath: "../../outputs/cloudflare-deploy/wrangler.json",
}) + "\n");
if (!local.BUNNY_STORAGE_PASSWORD?.trim()) {
  console.log("Copy .dev.vars.cloudflare.example to .dev.vars.cloudflare and fill BUNNY_STORAGE_PASSWORD.");
}
if (rolesSource === "backend" && !gameApiBaseUrl)
  console.warn("Warning: ROLES_SOURCE=backend but GAME_API_BASE_URL is not set; the deployed site will have no admins or approved photographers.");
if (rolesSource === "mock" && !mockAdmins.length)
  console.warn("Warning: roles are mocked (ROLES_SOURCE is not backend) and MOCK_ADMIN_EMAILS is empty; the deployed site will have no admins.");
console.log("Prepared outputs/cloudflare-deploy/wrangler.json for the recorded account and database.");
console.log("Default Wrangler deployment now selects this Bunny configuration.");
console.log(`R2 bindings are omitted. workers.dev is ${target.workersDev === true ? "enabled" : "disabled"}; preview URLs remain disabled.`);
console.log("Secret values are read only from the ignored .dev.vars.cloudflare file and are never printed.");
