// `npm run build:node`: the Vinext build (dist/) plus the server entry the host starts (dist-node/server.mjs).
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const outDir = new URL("dist-node/", root);

const result = spawnSync(process.execPath, [fileURLToPath(new URL("scripts/run-framework.mjs", root)), "build"], {
  cwd: root,
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await copyFile(new URL("scripts/node-server.mjs", root), new URL("server.mjs", outDir));
console.log("Node server entry: dist-node/server.mjs");
