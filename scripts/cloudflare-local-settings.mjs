import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";

export async function readCloudflareLocalSettings() {
  try {
    const settings = parseEnv(await readFile(new URL("../.dev.vars.cloudflare", import.meta.url), "utf8"));
    if (settings.FIREBASE_AUTH_EMULATOR_HOST)
      throw new Error("Emulator settings are not allowed in .dev.vars.cloudflare.");
    return settings;
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}
