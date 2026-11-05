import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { SETTING_KEYS } from "../lib/runtime/types.ts";
import { runtime as nodeRuntime } from "../lib/runtime/node.ts";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

function sources(dir) {
  const out = [];
  for (const name of readdirSync(path.join(root, dir))) {
    const rel = path.join(dir, name);
    if (statSync(path.join(root, rel)).isDirectory()) out.push(...sources(rel));
    else if (/\.(ts|tsx|mts|mjs)$/.test(name)) out.push(rel.split(path.sep).join("/"));
  }
  return out;
}

test("only the Worker adapter imports cloudflare:workers", () => {
  const importers = ["app", "components", "lib", "db", "worker"]
    .flatMap(sources)
    .filter((file) => /from\s+["']cloudflare:workers["']/.test(read(file)));
  assert.deepEqual(importers, ["lib/runtime/worker.ts"]);
});

test("the Node adapter reads settings from process.env and has no D1 or R2", () => {
  const before = process.env.GAME_API_BASE_URL;
  try {
    process.env.GAME_API_BASE_URL = "http://127.0.0.1:3001";
    assert.equal(nodeRuntime.name, "node");
    assert.equal(nodeRuntime.setting("GAME_API_BASE_URL"), "http://127.0.0.1:3001");
    delete process.env.GAME_API_BASE_URL;
    assert.equal(nodeRuntime.setting("GAME_API_BASE_URL"), undefined);
    assert.equal(nodeRuntime.d1(), null);
    assert.equal(nodeRuntime.r2Bucket(), null);
  } finally {
    if (before === undefined) delete process.env.GAME_API_BASE_URL;
    else process.env.GAME_API_BASE_URL = before;
  }
});

test("every setting key is declared in cloudflare-env.d.ts, and every declared string setting is a key", () => {
  const declared = [...read("cloudflare-env.d.ts").matchAll(/^\s+([A-Z][A-Z0-9_]+)\?:\s*string;/gm)].map((m) => m[1]);
  assert.deepEqual([...SETTING_KEYS].sort(), declared.sort());
});

test("the Worker build maps #runtime to the Worker adapter explicitly, with no other mapping", () => {
  const vite = read("vite.config.ts");
  assert.match(vite, /"#runtime":\s*fileURLToPath\(new URL\("\.\/lib\/runtime\/worker\.ts"/);
  const tsconfig = JSON.parse(read("tsconfig.json"));
  assert.deepEqual(tsconfig.compilerOptions.paths["#runtime"], ["./lib/runtime/worker.ts"]);
  assert.equal(JSON.parse(read("package.json")).imports, undefined, "no package.json #imports fallback");
});
