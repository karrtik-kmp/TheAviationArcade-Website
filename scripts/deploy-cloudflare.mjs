import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readCloudflareLocalSettings } from "./cloudflare-local-settings.mjs";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--dry-run")) {
  console.error("Usage: npm run deploy [-- --dry-run]. The recorded Bunny target cannot be overridden.");
  process.exit(1);
}
const settings = await readCloudflareLocalSettings();
const missing = ["BUNNY_STORAGE_PASSWORD", "STAFF_EMAILS"].filter((key) => !settings[key]?.trim());
if (missing.length) {
  console.error(`Fill ${missing.join(" and ")} in ignored .dev.vars.cloudflare before deploying. No deployment was started.`);
  process.exit(1);
}
const root = fileURLToPath(new URL("../", import.meta.url));
function run(script, parameters) {
  const result = spawnSync(process.execPath, [script, ...parameters], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run("scripts/run-framework.mjs", ["build"]);
// Also prepare explicitly for the managed build runner, which keeps its own defaults.
run("scripts/prepare-cloudflare-deploy.mjs", []);
run("node_modules/wrangler/bin/wrangler.js", [
  "deploy",
  "--config", "outputs/cloudflare-deploy/wrangler.json",
  "--secrets-file", "outputs/cloudflare-secrets.json",
  ...args,
]);
