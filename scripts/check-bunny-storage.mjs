import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { BunnyPhotoStorage } from "../lib/bunny-storage.ts";
import { readCloudflareLocalSettings } from "./cloudflare-local-settings.mjs";

const readJson = async (relative) => JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));
const target = await readJson("../config/cloudflare-prototype.json");
const secrets = await readCloudflareLocalSettings();
if (!secrets.BUNNY_STORAGE_PASSWORD?.trim()) {
  console.error("Fill BUNNY_STORAGE_PASSWORD in the ignored .dev.vars.cloudflare file. No live request was sent.");
  process.exit(1);
}
const storage = new BunnyPhotoStorage({ ...target.photoStorage, password: secrets.BUNNY_STORAGE_PASSWORD });
const key = `setup-checks/${randomUUID()}`;
const content = new TextEncoder().encode("Airplane Games private photo-storage connection check.");
let passed = false;
try {
  await storage.put(key, content, { httpMetadata: { contentType: "application/octet-stream" } });
  const object = await storage.get(key);
  if (!object) throw new Error("The uploaded test object was not found.");
  const actual = new Uint8Array(await new Response(object.body).arrayBuffer());
  if (actual.length !== content.length || actual.some((byte, index) => byte !== content[index]))
    throw new Error("The downloaded test object differs from the upload.");
  passed = true;
} catch {
  console.error("Bunny connection check failed. Check the zone, region and read-write zone password; credentials were not printed.");
  process.exitCode = 1;
} finally {
  // This random probe belongs only to this invocation, including an ambiguous PUT acknowledgement.
  try {
    await storage.delete(key);
  } catch {
    console.error(`Probe cleanup failed. Remove this test object from Bunny manually: ${key}`);
    passed = false;
    process.exitCode = 1;
  }
}
if (passed) console.log("Bunny private storage check passed: upload, exact-byte download and deletion.");
