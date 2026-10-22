import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(scriptDirectory, "..");

export function firebaseNpxPath() {
  const configured = process.env.FIREBASE_NPX_PATH?.trim();
  const candidate =
    configured ||
    path.join(
      path.dirname(process.execPath),
      "node_modules",
      "npm",
      "bin",
      "npx-cli.js",
    );
  if (!existsSync(candidate)) {
    throw new Error(
      `Could not find npm's npx CLI at ${candidate}. Set FIREBASE_NPX_PATH to npx-cli.js.`,
    );
  }
  return candidate;
}

export function runFirebase(args, { capture = false } = {}) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    throw new TypeError("Firebase CLI arguments must be an array of strings.");
  }

  const cacheDirectory = path.join(
    projectRoot,
    ".sites-runtime",
    "firebase-cli-cache",
  );
  mkdirSync(cacheDirectory, { recursive: true });
  const env = {
    ...process.env,
    npm_config_cache: process.env.FIREBASE_NPM_CACHE || cacheDirectory,
  };

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(
        process.execPath,
        [firebaseNpxPath(), "--yes", "firebase-tools@latest", ...args],
        {
          cwd: projectRoot,
          env,
          stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
          windowsHide: true,
        },
      );
    } catch (error) {
      reject(error);
      return;
    }

    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }
    child.once("error", reject);
    child.once("close", (code, signal) => {
      resolve({ code: code ?? (signal ? 1 : 0), signal, stdout, stderr });
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (
    !args.length ||
    (args.length === 1 && (args[0] === "--help" || args[0] === "-h"))
  ) {
    process.stdout.write(
      "Usage: node scripts/firebase-cli.mjs <firebase command and arguments>\n" +
        "Example: node scripts/firebase-cli.mjs login --no-localhost\n",
    );
    return;
  }
  const result = await runFirebase(args);
  process.exitCode = result.code;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Firebase CLI failed."}\n`,
    );
    process.exitCode = 1;
  });
}
