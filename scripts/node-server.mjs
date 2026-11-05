// The production server for the Node build. `npm run build:node` copies this file to dist-node/server.mjs,
// next to the Vinext output in dist/. The host starts it with:
//   node --env-file=/etc/aviation-arcade/web-<name>.env dist-node/server.mjs
// Settings come from the process environment only (web.env.example lists them).
import path from "node:path";
import { fileURLToPath } from "node:url";

const SURFACES = new Set(["public", "admin"]);
const SHUTDOWN_GRACE_MS = 15_000;

const surface = process.env.SITE_SURFACE;
if (!SURFACES.has(surface)) {
  console.error("SITE_SURFACE must be public or admin. Refusing to start.");
  process.exit(1);
}
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error("PORT must be a port number. Refusing to start.");
  process.exit(1);
}

// nginx (one hop) terminates TLS and sets X-Forwarded-Proto, so request URLs, and with them the same-origin
// checks on every write, see https. Vinext reads this when its server module loads, so set it before the import.
// Hosting headers never authorize anything.
process.env.VINEXT_TRUST_PROXY ??= "1";

const { startProdServer } = await import("vinext/server/prod-server");
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const { server } = await startProdServer({ host, port, outDir });
console.log(`Serving the ${surface} surface on http://${host}:${port}`);

let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: closing.`);
  const force = setTimeout(() => {
    server.closeAllConnections();
    process.exit(0);
  }, SHUTDOWN_GRACE_MS);
  force.unref();
  server.close(() => process.exit(0));
  server.closeIdleConnections();
}
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
