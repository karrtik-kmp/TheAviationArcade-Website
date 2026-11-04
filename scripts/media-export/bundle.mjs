// The D1 -> backend photo export: argument parsing, the output folder rules, the bundle writer and the drift check.
// Sources (local.mjs, remote.mjs) only read; every decision about a row is in lib/submissions/export.ts.
import { spawnSync } from "node:child_process";
import { mkdir, lstat, readdir, readFile, realpath, rm, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs as nodeParseArgs } from "node:util";
import {
  EXPORT_SQL,
  MANIFEST_FILE,
  STATE_FILE,
  VERIFY_SQL,
  buildManifest,
  checkImage,
  compareState,
  exportState,
  finishEntry,
  planEntry,
  sha256Hex,
  summarise,
} from "../../lib/submissions/export.ts";

export const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const LOCAL_PROJECT = "demo-airplane-games";
export const REMOTE_PROJECT = "airplane-games-auth-20261022";

/** Exit codes. 0 ok, 1 unexpected (no manifest), 2 refused before reading, 3 written with read errors, 4 drift found. */
export const EXIT = { ok: 0, failed: 1, refused: 2, readErrors: 3, drift: 4 };

/** A refusal, or a source error flagged `refusal: true` by its `ready()` check. */
export const isRefusal = (error) => error instanceof Refusal || (error instanceof Error && error.refusal === true);

/** A refusal: the run did not start (bad arguments, unsafe folder, missing local state). Exit 2. */
export class Refusal extends Error {
  constructor(message) {
    super(message);
    this.name = "Refusal";
    this.code = "REFUSED";
  }
}

export const USAGE = [
  "Usage:",
  "  npm run media:export -- --out <new-dir> [--remote] [--project <id>] [--persist-to <dir>]",
  "  npm run media:export -- --verify <bundle-dir> [--remote] [--persist-to <dir>]",
  "  --persist-to is local only; --remote reads the live database and Bunny storage.",
].join("\n");

// ---- arguments ----

/** Returns `{ ok: true, mode, dir, remote, project, persistTo }` or `{ ok: false, error }`. Reads nothing. */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({
      args: argv,
      allowPositionals: false,
      strict: true,
      options: {
        out: { type: "string" },
        verify: { type: "string" },
        remote: { type: "boolean", default: false },
        project: { type: "string" },
        "persist-to": { type: "string" },
      },
    }));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid arguments." };
  }
  const has = (v) => typeof v === "string";
  if (has(values.out) && has(values.verify)) return { ok: false, error: "Use either --out or --verify, not both." };
  if (!has(values.out) && !has(values.verify)) return { ok: false, error: "Give --out <new-dir> or --verify <bundle-dir>." };
  const dir = has(values.out) ? values.out : values.verify;
  if (dir.trim() === "") return { ok: false, error: "The folder must not be empty." };
  if (values.remote && has(values["persist-to"])) return { ok: false, error: "--persist-to is for the local source and cannot be used with --remote." };
  if (has(values.verify) && has(values.project)) return { ok: false, error: "--project applies to --out only." };
  if (has(values.project) && values.project.trim() === "") return { ok: false, error: "--project must not be empty." };
  return {
    ok: true,
    mode: has(values.out) ? "out" : "verify",
    dir,
    remote: values.remote === true,
    project: has(values.project) ? values.project : values.remote ? REMOTE_PROJECT : LOCAL_PROJECT,
    persistTo: has(values["persist-to"]) ? values["persist-to"] : undefined,
  };
}

// ---- output folder ----

/**
 * Validates the output folder without creating it. The parent must exist; an existing folder must be empty; a folder
 * inside this repo must be git-ignored (the bundle holds private photos). Returns the resolved path.
 */
export async function checkOutDir(outDir, { repoRoot = REPO_ROOT } = {}) {
  const absolute = path.resolve(outDir);
  let parent;
  try {
    parent = await realpath(path.dirname(absolute));
    if (!(await stat(parent)).isDirectory()) throw new Error("not a folder");
  } catch {
    throw new Refusal(`The parent folder of ${absolute} does not exist. Create it first; --out makes only the last folder.`);
  }
  const dir = path.join(parent, path.basename(absolute));
  const existing = await lstat(dir).catch(() => null);
  if (existing) {
    if (!existing.isDirectory()) throw new Refusal(`${dir} exists and is not a folder.`);
    if ((await readdir(dir)).length > 0) throw new Refusal(`${dir} is not empty. Export into a new folder.`);
  }
  const root = await realpath(repoRoot);
  const relative = path.relative(root, dir);
  const inside = relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  if (inside) {
    const ignored = spawnSync("git", ["check-ignore", "-q", "--", relative === "" ? "." : relative], { cwd: root, stdio: "ignore" });
    if (ignored.status !== 0) {
      throw new Refusal(`${dir} is inside the repository but is not git-ignored, and the bundle holds private photos. Use outputs/media-export/<UTC stamp>.`);
    }
  }
  return { dir, outside: !inside, existed: existing !== null };
}

// ---- report ----

const REASON_LABELS = { needs_reupload: "needs re-upload by the photographer" };
const label = (reason) => REASON_LABELS[reason] ?? reason;

/** Report lines. Counts and ids only: never an email, credit, text, owner, key or password. */
export function reportLines({ summary, sourceName, dir, project }) {
  const lines = [
    `Source: ${sourceName}`,
    `Output: ${dir}`,
    `Project: ${project}`,
    `Exported: ${summary.exported}`,
    `Skipped: ${summary.skipped}`,
  ];
  for (const { reason, count } of summary.counts) lines.push(`  ${label(reason)}: ${count}`);
  for (const [warning, count] of Object.entries(summary.warnings)) lines.push(`Warning ${warning}: ${count}`);
  lines.push(`Distinct owners exported: ${summary.distinctOwners}`);
  for (const { reason, ids } of summary.lists) {
    lines.push(`${label(reason)} (${ids.length}): ${ids.join(", ")}`);
  }
  return lines;
}

function readFailureLine(error) {
  const status = error && typeof error === "object" && Number.isInteger(error.status) ? error.status : "unknown";
  return `Photo storage read failed (status ${status})`;
}

// ---- export ----

/**
 * Writes the bundle: one file per exported photo (`wx`, read back and hashed from disk), then export-state.json, then
 * manifest.json LAST. `source` is a source object or a function returning one (opened only after the folder passed its
 * checks, and always closed). Returns `{ exitCode, message?, summary? }`; throws on unexpected failure (no manifest then).
 * `build` is injectable for tests only.
 */
export async function runExport({ source, outDir, project, now = new Date(), log = console.log, sourceName = "local", build = buildManifest, repoRoot }) {
  let opened;
  let dir;
  let created = false;
  const written = [];
  try {
    const checked = await checkOutDir(outDir, { repoRoot });
    if (checked.outside) log("Warning: this folder holds private photos; don't use a cloud-synced folder (OneDrive, Dropbox, iCloud, Google Drive).");
    opened = typeof source === "function" ? await source() : source;
    await opened.ready?.();
    dir = checked.dir;
    if (!checked.existed) {
      await mkdir(dir);
      created = true;
    }

    const rows = await opened.rows(EXPORT_SQL);
    const outcomes = [];
    const entries = [];
    const drafts = [];
    for (const row of rows) {
      const plan = planEntry(row, { project, now });
      if (!plan.ok) {
        outcomes.push({ id: plan.id, exported: false, reasons: plan.reasons });
        continue;
      }
      const { draft } = plan;
      let bytes;
      try {
        bytes = await opened.readImage(draft.imageKey);
      } catch (error) {
        log(readFailureLine(error));
        outcomes.push({ id: draft.id, exported: false, reasons: ["read_error"] });
        continue;
      }
      const checkedImage = checkImage(draft, bytes);
      if (!checkedImage.ok) {
        outcomes.push({ id: draft.id, exported: false, reasons: [checkedImage.reason] });
        continue;
      }
      const file = path.join(dir, checkedImage.file);
      written.push(file);
      await writeFile(file, bytes, { flag: "wx" });
      const finished = finishEntry(draft, checkedImage, sha256Hex(await readFile(file)));
      if (!finished.ok) {
        await rm(file);
        written.splice(written.indexOf(file), 1);
        outcomes.push({ id: draft.id, exported: false, reasons: [finished.reason] });
        continue;
      }
      entries.push(finished.entry);
      drafts.push(draft);
      outcomes.push({ id: draft.id, owner: draft.entry.owner, exported: true, warnings: finished.warnings });
    }

    const built = build(entries);
    await writeFile(path.join(dir, STATE_FILE), `${JSON.stringify(exportState(drafts), null, 2)}\n`, { flag: "wx" });
    await writeFile(path.join(dir, MANIFEST_FILE), built.text, { flag: "wx" });

    const summary = summarise(outcomes);
    for (const line of reportLines({ summary, sourceName, dir, project })) log(line);
    const readErrors = outcomes.some((o) => o.reasons?.includes("read_error"));
    return { exitCode: readErrors ? EXIT.readErrors : EXIT.ok, summary };
  } catch (error) {
    if (isRefusal(error)) {
      await removeWritten({ dir, written, created, log });
      return { exitCode: EXIT.refused, message: error.message };
    }
    await removeWritten({ dir, written, created, log });
    throw error;
  } finally {
    await opened?.close?.();
  }
}

/** A failed run must not leave private photos behind: remove what this run wrote (and the folder if it made it). */
async function removeWritten({ dir, written, created, log }) {
  if (dir === undefined || (written.length === 0 && !created)) return;
  try {
    for (const file of written) await rm(file, { force: true });
    if (created) await rmdir(dir);
    log(created ? `Removed the ${written.length} file(s) this run wrote and the folder ${dir}.` : `Removed the ${written.length} file(s) this run wrote from ${dir}.`);
  } catch {
    log(`Delete ${dir}; it holds photos`);
  }
}

// ---- drift guard ----

/** Re-reads (id, version, status) and compares with the bundle's export-state.json. Exit 4 on any difference. */
export async function runVerify({ source, bundleDir, log = console.log }) {
  let opened;
  try {
    const stateFile = path.join(path.resolve(bundleDir), STATE_FILE);
    let expected;
    try {
      expected = JSON.parse(await readFile(stateFile, "utf8"));
    } catch {
      throw new Refusal(`${stateFile} is missing or is not valid JSON. Verify a folder written by --out.`);
    }
    opened = typeof source === "function" ? await source() : source;
    await opened.ready?.();
    const result = compareState(expected, await opened.rows(VERIFY_SQL));
    if (result.malformed) throw new Refusal(`${stateFile} is not an export state file.`);
    if (result.added > 0) log(`${result.added} proposal(s) in D1 are not in this bundle (skipped at export, or added since).`);
    if (result.ok) {
      log(`Unchanged: ${expected.length} exported proposal(s) still match the bundle.`);
      return { exitCode: EXIT.ok, result };
    }
    log(`DRIFT: ${result.differences.length} exported proposal(s) changed or vanished since the export. Re-export to a new folder.`);
    for (const kind of ["changed", "missing"]) {
      const ids = result.differences.filter((d) => d.kind === kind).map((d) => d.id);
      if (ids.length > 0) log(`  ${kind} (${ids.length}): ${ids.join(", ")}`);
    }
    return { exitCode: EXIT.drift, result };
  } catch (error) {
    if (isRefusal(error)) return { exitCode: EXIT.refused, message: error.message };
    throw error;
  } finally {
    await opened?.close?.();
  }
}
