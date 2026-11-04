import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

// Cloudflare Workers throw on `redirect: "error"` ("won't be implemented ... use manual"), so every
// such fetch fails before it is sent. Node accepts it, so unit tests with fakes cannot catch this:
// scan the code that runs in the Worker instead.
const roots = ["lib", "app", "components"];

async function* sourceFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) yield full;
  }
}

test('Worker code never uses fetch redirect "error"', async () => {
  const offenders = [];
  for (const root of roots)
    for await (const file of sourceFiles(root)) {
      const text = await readFile(file, "utf8");
      if (/redirect\s*:\s*["']error["']/.test(text)) offenders.push(file);
    }
  assert.deepEqual(offenders, []);
});
