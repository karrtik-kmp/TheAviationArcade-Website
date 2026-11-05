import vinext from "vinext";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "vite";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { sites } from "./scripts/vite/sites-vite-plugin";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

/**
 * Local settings for `npm run dev`: `.dev.vars` (or `.dev.vars.<DEV_VARS_PROFILE>`, used by the demo
 * preview) is copied into the process environment, never over a value that is already set. The server
 * reads settings only from the process environment (lib/settings.ts); a production build never loads
 * these files (the hosted server passes `node --env-file`).
 */
function loadDevVars() {
  const profile = process.env.DEV_VARS_PROFILE;
  const file = new URL(profile ? `./.dev.vars.${profile}` : "./.dev.vars", import.meta.url);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      if (profile) throw new Error(`Missing .dev.vars.${profile}.`);
      return;
    }
    throw error;
  }
  for (const [key, value] of Object.entries(parseEnv(text))) process.env[key] ??= value;
}

export default defineConfig(({ command }) => {
  if (command === "serve") loadDevVars();

  return {
    server: {
      // Loopback IPv4: the README and the browser suites use http://127.0.0.1:5173.
      ...(managedLinux
        ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] }
        : { host: "127.0.0.1" }),
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      // Browsing is public; account features use Firebase, with no hosting sign-in.
      sites({ mockAuth: false }),
    ],
  };
});
