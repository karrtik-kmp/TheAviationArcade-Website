// Exports the D1 photo proposals (and their photos) as a bundle for the game backend's media import.
// Usage: see USAGE in scripts/media-export/bundle.mjs. Operator steps: docs/MEDIA_PLAN.md.
import { EXIT, USAGE, parseArgs, runExport, runVerify } from "./media-export/bundle.mjs";

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(`${parsed.error}\n${USAGE}`);
  process.exit(EXIT.refused);
}

// Opened lazily, after the output folder passed its checks. The remote reader is loaded only for --remote.
const source = async () => {
  const images = parsed.mode === "out";
  if (parsed.remote) {
    const { remoteSource } = await import("./media-export/remote.mjs");
    return remoteSource({ project: parsed.project, images });
  }
  console.log("Reading local state. Stop `npm run dev` first; two processes must not share it.");
  const { localSource } = await import("./media-export/local.mjs");
  return localSource({ persistTo: parsed.persistTo });
};

let outcome;
try {
  outcome =
    parsed.mode === "out"
      ? await runExport({ source, outDir: parsed.dir, project: parsed.project, sourceName: parsed.remote ? "remote" : "local" })
      : await runVerify({ source, bundleDir: parsed.dir });
} catch (error) {
  console.error(`Export failed; no manifest was written. ${error instanceof Error ? error.message : "Unexpected error."}`);
  process.exit(EXIT.failed);
}
if (outcome.message) console.error(outcome.message);
if (outcome.exitCode === EXIT.readErrors) console.error("Some photos could not be read from storage; they are listed as read_error. Re-run into a new folder.");
process.exit(outcome.exitCode);
