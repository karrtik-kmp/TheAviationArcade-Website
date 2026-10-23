// Dedicated loopback-only profile. Does not read or modify hosted Firebase accounts.
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { demoAuthUsers, demoPassword, seedAuthDemoUsers } from "./seed-auth-emulator.mjs";
await seedAuthDemoUsers();
const user = demoAuthUsers.find((user) => user.email === "demo-pilot@sites.test");
const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: user.email, password: demoPassword, returnSecureToken: true }),
  signal: AbortSignal.timeout(10000),
});
const result = await response.json();
if (!response.ok || typeof result.localId !== "string") throw new Error("Start the local Firebase Auth emulator before the demo preview.");
const defaults = await readFile(new URL("../.dev.vars.example", import.meta.url), "utf8");
if (!defaults.includes("FIREBASE_PROJECT_ID=demo-airplane-games")) throw new Error("Local example no longer targets the demo project.");
await writeFile(new URL("../.dev.vars.demo-preview", import.meta.url), defaults +
  `\nDEMO_ACCOUNT_UID=${result.localId}\nDEMO_LOGIN_EMAIL=${user.email}\nDEMO_LOGIN_PASSWORD=${demoPassword}\n`, { mode: 0o600 });
const child = spawn(process.execPath, ["--import", "./scripts/sites-env.mjs", "./node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5186", "--strictPort"], {
  cwd: new URL("../", import.meta.url), stdio: "inherit", windowsHide: true,
  env: { ...process.env, CLOUDFLARE_ENV: "demo-preview" },
});
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
