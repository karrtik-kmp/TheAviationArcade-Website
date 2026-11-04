/**
 * Pure core of the D1 -> game backend photo export (Backend docs/plans/media-import.md, "Manifest format (final)").
 * No I/O: the CLI reads rows and photo bytes, this module decides what is exported, what is skipped and why,
 * and builds a manifest the backend can never refuse as a whole. Relative imports only, so `node --test` loads it.
 *
 * The contact email, photographer name, review note and retry key are never selected (see EXPORT_SQL) and never
 * appear in an entry (see ENTRY_KEYS). Everything the backend judges per entry (owner project and role, file,
 * size, type, digest, date, description composition) is left to the backend dry run; only the checks that would
 * make the backend refuse the WHOLE manifest are mirrored here, and `buildManifest` re-asserts them.
 */
import { createHash } from "node:crypto";
import { z } from "zod";

// ---- limits (Backend media-import.ts, media.service.ts, image-sniff.ts at commit 4ddb78e) ----

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 4096;
export const MAX_MANIFEST_BYTES = 10 * 1024 * 1024;
export const MAX_ENTRIES = 5000;

export const MANIFEST_FILE = "manifest.json";
export const STATE_FILE = "export-state.json";

// ---- copied from the backend ----

/**
 * COPIED from Backend src/content/media/media-import.ts at commit 4ddb78e (entrySchema, manifestSchema, parseManifest,
 * MAX_MANIFEST_BYTES, MAX_ENTRIES). The backend refuses the whole run (exit 2) when any of this fails, so the export
 * must pass it for every manifest it writes. Re-copy it, do not edit it, when the backend changes.
 * Version gap: the backend runs zod 4 (4.6.7 at 4ddb78e), this site zod 3.25. The copy uses only strictObject,
 * literal, enum, array().max and string().min().max(), which behave the same in both; recheck on re-copy.
 */
export const D1_STATUSES = ["pending", "changes_requested", "approved", "rejected"] as const;
export const D1_RIGHTS_BASES = ["own", "authorized"] as const;

const optionalText = z.string().optional();

const entrySchema = z.strictObject({
  sourceId: z.string().min(1).max(128),
  owner: z.string().min(1).max(512),
  status: z.enum(D1_STATUSES),
  file: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  sha256: z.string().min(1).max(100),
  credit: optionalText,
  rightsBasis: z.enum(D1_RIGHTS_BASES),
  submittedAt: z.string().min(1).max(64),
  description: optionalText,
  aircraft: optionalText,
  airline: optionalText,
  registration: optionalText,
  location: optionalText,
  airportCode: optionalText,
  capturedOn: optionalText,
  title: optionalText,
  factualSource: optionalText,
  rightsEvidence: optionalText,
});

const manifestSchema = z.strictObject({
  version: z.literal(1),
  source: z.literal("d1"),
  entries: z.array(entrySchema).max(MAX_ENTRIES),
});

export type ManifestEntry = z.infer<typeof entrySchema>;
export type Manifest = z.infer<typeof manifestSchema>;
export type ManifestResult = { ok: true; manifest: Manifest } | { ok: false; error: string };

/** Copy of the backend's parseManifest (JSON, strict schema, duplicate sourceId). */
export function parseManifest(text: string): ManifestResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "manifest.json is not valid JSON." };
  }
  const parsed = manifestSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.length > 0 ? i.path.join(".") : "(manifest)"}: ${i.message}`);
    return { ok: false, error: `manifest.json does not match the schema (${issues.join("; ")}).` };
  }
  const seen = new Set<string>();
  for (const entry of parsed.data.entries) {
    if (seen.has(entry.sourceId)) return { ok: false, error: `manifest.json lists sourceId "${entry.sourceId}" more than once.` };
    seen.add(entry.sourceId);
  }
  return { ok: true, manifest: parsed.data };
}

/** COPIED exactly from Backend src/accounts/account-principal.ts at commit 4ddb78e. */
export const MAX_UID_LENGTH = 128;
export function uidOfAccountPrincipal(value: unknown, projectId: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const prefix = `firebase:${projectId}:`;
  if (!value.startsWith(prefix)) return undefined;
  const uid = value.slice(prefix.length);
  if (uid.length < 1 || uid.length > MAX_UID_LENGTH) return undefined;
  if (uid.trim() !== uid) return undefined;
  if (/[:/]/.test(uid) || /\p{Cc}/u.test(uid)) return undefined;
  return uid;
}

// ---- SQL ----

/** The payload keys the export reads (all other payload keys, `email` above all, are never selected). */
export const PAYLOAD_FIELDS = [
  "credit",
  "rightsBasis",
  "description",
  "aircraft",
  "airline",
  "registration",
  "location",
  "airportCode",
  "capturedOn",
  "title",
  "factualSource",
  "rightsEvidence",
] as const;

const OPTIONAL_FIELDS = PAYLOAD_FIELDS.filter((f) => f !== "rightsBasis");

/** Every key an entry may carry; an entry is built only from these. */
export const ENTRY_KEYS = [
  "sourceId",
  "owner",
  "status",
  "file",
  "contentType",
  "sha256",
  "rightsBasis",
  "submittedAt",
  "credit",
  "description",
  "aircraft",
  "airline",
  "registration",
  "location",
  "airportCode",
  "capturedOn",
  "title",
  "factualSource",
  "rightsEvidence",
] as const;

const payloadColumns = PAYLOAD_FIELDS.flatMap((f) => [
  `CASE WHEN json_valid(payload) THEN json_type(payload,'$.${f}') END AS ${f}_type`,
  `CASE WHEN json_valid(payload) THEN json_extract(payload,'$.${f}') END AS ${f}`,
]);

/** One read for both the local and the remote source. Never `*`, never the raw payload. */
export const EXPORT_SQL = [
  "SELECT id, owner_id, status, version, image_key, image_mime, image_bytes, width, height, digest, created_at,",
  "json_valid(payload) AS payload_ok,",
  `${payloadColumns.join(", ")}`,
  "FROM submissions ORDER BY created_at, id",
].join(" ");

/** The drift guard's read: identity, version and status only. */
export const VERIFY_SQL = "SELECT id, version, status FROM submissions ORDER BY id";

// ---- planning ----

export type ExportRow = Record<string, string | number | null | undefined>;

export type SkipReason =
  | "demo"
  | "rejected"
  | "bad_status"
  | "bad_id"
  | "bad_owner"
  | "owner_project_mismatch"
  | "bad_payload"
  | "bad_submitted_at"
  | "bad_image_ref"
  | "needs_reupload"
  | "missing_image"
  | "empty_image"
  | "unsupported_type"
  | "digest_mismatch"
  | "read_error";

/** Report order: re-uploads first (the photographer must act), then the rest. */
export const REASON_ORDER: readonly SkipReason[] = [
  "needs_reupload",
  "demo",
  "rejected",
  "bad_status",
  "bad_id",
  "bad_owner",
  "owner_project_mismatch",
  "bad_payload",
  "bad_submitted_at",
  "bad_image_ref",
  "missing_image",
  "empty_image",
  "unsupported_type",
  "digest_mismatch",
  "read_error",
];

const KEPT_STATUSES = ["pending", "changes_requested", "approved"] as const;
const ID_PATTERN = /^[a-zA-Z0-9-]{1,80}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const KEY_TAIL = /^[0-9a-f-]{36}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
/** D1 `payload.rightsBasis` spelling -> manifest spelling. Exact match only. */
export const RIGHTS_FROM_D1: Readonly<Record<string, "own" | "authorized">> = Object.freeze({
  owner: "own",
  authorized: "authorized",
});

/** A row that passed every check that needs no photo. `entry` still lacks `file` and `contentType`. */
export type Draft = {
  id: string;
  imageKey: string;
  declaredMime: string;
  /** The row version at read time, for the drift guard. */
  version: number;
  entry: Omit<ManifestEntry, "file" | "contentType">;
};

export type Plan = { ok: true; draft: Draft } | { ok: false; id: string; reasons: SkipReason[] };

/** Owner check: the backend's principal validator for `project`, plus the backend's 512 limit. */
export function ownerCheck(owner: unknown, project: string): "ok" | "bad_owner" | "owner_project_mismatch" {
  if (typeof owner !== "string" || owner.length < 1 || owner.length > 512) return "bad_owner";
  if (uidOfAccountPrincipal(owner, project) !== undefined) return "ok";
  const other = /^firebase:([^:]+):/.exec(owner);
  if (other && other[1] !== project && uidOfAccountPrincipal(owner, other[1]!) !== undefined) {
    return "owner_project_mismatch";
  }
  return "bad_owner";
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/**
 * Decide, from the row alone, whether a proposal can be exported. Every pre-download reason that applies is returned
 * (the first one is the one counted). Demo, rejected and unknown-status rows return that single reason.
 */
export function planEntry(row: ExportRow, ctx: { project: string; now: Date }): Plan {
  const id = String(row.id);
  const digest = row.digest;
  if (id.startsWith("demo-submission-") || (typeof digest === "string" && digest.startsWith("demo:"))) {
    return { ok: false, id, reasons: ["demo"] };
  }
  const status = row.status;
  if (status === "rejected") return { ok: false, id, reasons: ["rejected"] };
  if (typeof status !== "string" || !(KEPT_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, id, reasons: ["bad_status"] };
  }

  const reasons: SkipReason[] = [];
  if (!Number.isInteger(row.version)) reasons.push("bad_status");
  if (typeof row.id !== "string" || !ID_PATTERN.test(row.id)) reasons.push("bad_id");

  const owner = ownerCheck(row.owner_id, ctx.project);
  if (owner !== "ok") reasons.push(owner);

  // Payload: valid JSON, every read field NULL or text, rightsBasis exactly one of the two D1 spellings.
  let payloadBad = row.payload_ok !== 1;
  let rights: "own" | "authorized" | undefined;
  const optional: Partial<Record<(typeof OPTIONAL_FIELDS)[number], string>> = {};
  let credit: string | undefined;
  if (!payloadBad) {
    for (const field of PAYLOAD_FIELDS) {
      const type = row[`${field}_type`];
      const value = row[field];
      if (field === "rightsBasis") {
        if (type !== "text" || typeof value !== "string" || !Object.hasOwn(RIGHTS_FROM_D1, value)) payloadBad = true;
        else rights = RIGHTS_FROM_D1[value];
        continue;
      }
      // SQL NULL, a missing key and a JSON null all mean "no value": the key is left out.
      if (type === null || type === undefined || type === "null") continue;
      if (type !== "text" || typeof value !== "string") {
        payloadBad = true;
        continue;
      }
      if (value.trim() === "") continue;
      if (field === "credit") credit = value;
      else optional[field as (typeof OPTIONAL_FIELDS)[number]] = value;
    }
  }
  if (payloadBad) reasons.push("bad_payload");

  const created = row.created_at;
  let submittedAtOk = false;
  if (typeof created === "string" && ISO_UTC.test(created)) {
    const at = new Date(created);
    submittedAtOk =
      !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 19) === created.slice(0, 19) && at.getTime() <= ctx.now.getTime();
  }
  if (!submittedAtOk) reasons.push("bad_submitted_at");

  const imageKey = row.image_key;
  const keyOk =
    typeof row.id === "string" &&
    typeof imageKey === "string" &&
    imageKey.startsWith(`submissions/${row.id}/`) &&
    KEY_TAIL.test(imageKey.slice(`submissions/${row.id}/`.length));
  const sizesOk = isCount(row.image_bytes) && isCount(row.width) && isCount(row.height);
  if (typeof digest !== "string" || !DIGEST_PATTERN.test(digest) || !keyOk || !sizesOk) reasons.push("bad_image_ref");

  if (sizesOk && ((row.image_bytes as number) > MAX_IMAGE_BYTES || (row.width as number) > MAX_IMAGE_SIDE || (row.height as number) > MAX_IMAGE_SIDE)) {
    reasons.push("needs_reupload");
  }
  if (reasons.length > 0) return { ok: false, id, reasons };

  const entry: Draft["entry"] = {
    sourceId: id,
    owner: row.owner_id as string,
    status: status as (typeof KEPT_STATUSES)[number],
    sha256: digest as string,
    rightsBasis: rights!,
    submittedAt: created as string,
    ...(credit !== undefined ? { credit } : {}),
    ...optional,
  };
  return {
    ok: true,
    draft: { id, imageKey: imageKey as string, declaredMime: typeof row.image_mime === "string" ? row.image_mime : "", version: row.version as number, entry },
  };
}

// ---- after the download ----

/** JPEG or PNG by magic bytes only. Deeper validity (size, truncation) is the backend's job. */
export function sniffType(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((v, i) => bytes[i] === v)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type CheckedImage =
  | { ok: true; contentType: "image/jpeg" | "image/png"; file: string; warnings: string[] }
  | { ok: false; reason: "missing_image" | "empty_image" | "needs_reupload" | "unsupported_type" };

/** Checks on the downloaded bytes (null = storage had no such object). Run before writing the file. */
export function checkImage(draft: Draft, bytes: Uint8Array | null): CheckedImage {
  if (bytes === null) return { ok: false, reason: "missing_image" };
  if (bytes.length === 0) return { ok: false, reason: "empty_image" };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, reason: "needs_reupload" };
  const contentType = sniffType(bytes);
  if (contentType === null) return { ok: false, reason: "unsupported_type" };
  return {
    ok: true,
    contentType,
    file: `${draft.id}.${contentType === "image/png" ? "png" : "jpg"}`,
    warnings: draft.declaredMime !== contentType ? ["content_type_differs"] : [],
  };
}

export type Finished =
  | { ok: true; entry: ManifestEntry; warnings: string[] }
  | { ok: false; reason: "digest_mismatch" };

/** Completes the entry once the file was written and its sha256 was recomputed from the file read back from disk. */
export function finishEntry(draft: Draft, checked: Extract<CheckedImage, { ok: true }>, diskSha256: string): Finished {
  if (diskSha256 !== draft.entry.sha256) return { ok: false, reason: "digest_mismatch" };
  const entry = { ...draft.entry, file: checked.file, contentType: checked.contentType } as Record<string, unknown>;
  const ordered: Record<string, unknown> = {};
  for (const key of ENTRY_KEYS) if (entry[key] !== undefined) ordered[key] = entry[key];
  return { ok: true, entry: ordered as ManifestEntry, warnings: checked.warnings };
}

// ---- manifest ----

export type BuiltManifest = { manifest: Manifest; text: string; bytes: number };

/**
 * Serialises the entries and re-parses the exact text with the copied backend schema. THROWS (the CLI exits 1 and writes
 * nothing) when the backend would refuse the whole manifest, or when two files would share a name on a case-insensitive disk.
 */
export function buildManifest(entries: readonly ManifestEntry[]): BuiltManifest {
  const text = `${JSON.stringify({ version: 1, source: "d1", entries }, null, 2)}\n`;
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_MANIFEST_BYTES) throw new Error(`The manifest would be ${bytes} bytes; the backend accepts at most ${MAX_MANIFEST_BYTES}.`);
  const parsed = parseManifest(text);
  if (!parsed.ok) throw new Error(`The export would produce a manifest the backend refuses: ${parsed.error}`);
  const files = new Set<string>();
  for (const entry of parsed.manifest.entries) {
    const lower = entry.file.toLowerCase();
    if (files.has(lower)) throw new Error("Two photos would share one file name on a case-insensitive disk.");
    files.add(lower);
  }
  return { manifest: parsed.manifest, text, bytes };
}

// ---- drift guard ----

export type ExportState = { id: string; version: number; status: string }[];

/** `export-state.json` content: identity, version and status of each exported row. No personal data. */
export function exportState(drafts: readonly Draft[]): ExportState {
  return drafts.map((d) => ({ id: d.id, version: d.version, status: d.entry.status }));
}

export type StateDifference = { id: string; kind: "missing" | "changed" };
export type StateComparison = { ok: boolean; malformed: boolean; differences: StateDifference[]; added: number };

/** Compares the saved state with the rows now in D1 (VERIFY_SQL). Rows added since are counted, not a failure. */
export function compareState(expected: unknown, current: readonly ExportRow[]): StateComparison {
  const valid =
    Array.isArray(expected) &&
    expected.every(
      (e) => e !== null && typeof e === "object" && typeof e.id === "string" && Number.isInteger(e.version) && typeof e.status === "string",
    );
  if (!valid) return { ok: false, malformed: true, differences: [], added: 0 };
  const now = new Map(current.map((r) => [String(r.id), r]));
  const differences: StateDifference[] = [];
  for (const e of expected as ExportState) {
    const row = now.get(e.id);
    if (!row) differences.push({ id: e.id, kind: "missing" });
    else if (Number(row.version) !== e.version || row.status !== e.status) differences.push({ id: e.id, kind: "changed" });
  }
  const known = new Set((expected as ExportState).map((e) => e.id));
  const added = current.filter((r) => !known.has(String(r.id))).length;
  return { ok: differences.length === 0, malformed: false, differences, added };
}

// ---- report ----

export type Outcome = { id: string; owner?: string; exported: boolean; reasons?: SkipReason[]; warnings?: string[] };
export type Summary = {
  exported: number;
  skipped: number;
  /** One count per row, by its first reason; needs_reupload first. */
  counts: { reason: SkipReason; count: number }[];
  /** The ids under every reason that applies to them (ids only). */
  lists: { reason: SkipReason; ids: string[] }[];
  warnings: Record<string, number>;
  distinctOwners: number;
};

export function summarise(outcomes: readonly Outcome[]): Summary {
  const counts = new Map<SkipReason, number>();
  const lists = new Map<SkipReason, string[]>();
  const warnings: Record<string, number> = {};
  const owners = new Set<string>();
  let exported = 0;
  for (const o of outcomes) {
    for (const w of o.warnings ?? []) warnings[w] = (warnings[w] ?? 0) + 1;
    if (o.exported) {
      exported += 1;
      if (o.owner !== undefined) owners.add(o.owner);
      continue;
    }
    const reasons = o.reasons ?? [];
    if (reasons.length > 0) counts.set(reasons[0]!, (counts.get(reasons[0]!) ?? 0) + 1);
    for (const r of reasons) lists.set(r, [...(lists.get(r) ?? []), o.id]);
  }
  return {
    exported,
    skipped: outcomes.length - exported,
    counts: REASON_ORDER.filter((r) => counts.has(r)).map((reason) => ({ reason, count: counts.get(reason)! })),
    lists: REASON_ORDER.filter((r) => lists.has(r)).map((reason) => ({ reason, ids: lists.get(reason)! })),
    warnings,
    distinctOwners: owners.size,
  };
}
