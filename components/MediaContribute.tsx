"use client";

import { ImageSquare } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AccountActions } from "@/components/AccessGate";
import { useAccountSession } from "@/components/AccountSession";
import { accountHeaders, accountSignInPath } from "@/lib/account";
import {
  AGREEMENT,
  MEDIA_MAX_BYTES,
  canAcceptAgreement,
  createUploadKeys,
  descriptionErrors,
  descriptionOf,
  encodeSubmission,
  hasAgreement,
  hasV1Statement,
  instagramErrors,
  normaliseInstagramHandle,
  rightsOf,
  submissionErrors,
  submissionOf,
  titleErrors,
  titleOf,
  licenceDiff,
  licenceErrors,
  licenceFields,
  licenceToValues,
  mediaOutcome,
  precheckImage,
  rebaseLicence,
  needsRightsStatement,
  normaliseDescription,
  splitEdit,
  DESCRIPTION_MAX,
  type LicenceField,
  type LicenceValues,
  type SubmissionField,
  type SubmissionValues,
  type UploadKeys,
  type UploadTarget,
} from "@/lib/media-form";
import { sitePath } from "@/lib/paths";
import type { ImageRef, MediaDetail, MediaItem, MediaLicence, MediaList, MediaVersion } from "@/lib/request/media";
import {
  AgreementChecks,
  ReviewNotice,
  SubmissionFields,
  allConfirmed,
  blankSubmission,
  noConfirmations,
  reviewLabel,
  submissionFrom,
  type Confirmations,
} from "@/components/MediaSubmission";
import "./contribute.css";

/**
 * The photographer media workspace on /contribute when roles come from the game backend
 * (MEDIA_PLAN.md, M2). Photos go to the backend through the website's /api/media routes; the
 * server reads the role again on every call, so nothing here grants access. The page offers no
 * play and no purchase: it only receives photos for review under the licence the photographer gives.
 */

// ---------------------------------------------------------------- calls

type Reply = {
  /** 0 when the request never got an answer. */
  status: number;
  code: string;
  error: string;
  retryAfter: number | null;
  body: Record<string, unknown>;
};

function toReply(status: number, text: string, retry: string | null): Reply {
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = text ? JSON.parse(text) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch {
    body = {};
  }
  const seconds = retry ? Number.parseInt(retry, 10) : Number.NaN;
  return {
    status,
    code: typeof body.code === "string" ? body.code : "",
    error: typeof body.error === "string" ? body.error : "",
    retryAfter: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
    body,
  };
}

async function callMedia(sessionKey: string, path: string, init?: { method?: string; json?: unknown }): Promise<Reply> {
  try {
    const response = await fetch(sitePath(path), {
      method: init?.method ?? "GET",
      cache: "no-store",
      headers: {
        ...(init?.json === undefined ? {} : { "Content-Type": "application/json" }),
        ...accountHeaders(sessionKey),
      },
      body: init?.json === undefined ? undefined : JSON.stringify(init.json),
    });
    return toReply(response.status, await response.text().catch(() => ""), response.headers.get("Retry-After"));
  } catch {
    return toReply(0, "", null);
  }
}

/** The raw file over XHR, for upload progress. */
function sendFile(args: {
  path: string;
  file: Blob;
  contentType: string;
  key: string;
  /** The rights statement sent with the file (the website sends v2). */
  statement: string;
  /** `X-Submission` (base64url); it holds the photographer's name, so it is never logged. */
  submission?: string;
  sessionKey: string;
  xhrRef: { current: XMLHttpRequest | null };
  onProgress: (loaded: number, total: number) => void;
  onSent: () => void;
}): Promise<Reply> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    args.xhrRef.current = xhr;
    xhr.open("POST", sitePath(args.path));
    xhr.timeout = 60_000;
    for (const [name, value] of Object.entries(accountHeaders(args.sessionKey))) xhr.setRequestHeader(name, value);
    xhr.setRequestHeader("Content-Type", args.contentType);
    xhr.setRequestHeader("Idempotency-Key", args.key);
    xhr.setRequestHeader("X-Rights-Statement", args.statement);
    if (args.submission !== undefined) xhr.setRequestHeader("X-Submission", args.submission);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) args.onProgress(event.loaded, event.total);
    };
    xhr.upload.onload = () => args.onSent();
    xhr.onload = () => resolve(toReply(xhr.status, xhr.responseText, xhr.getResponseHeader("Retry-After")));
    const failed = () => resolve(toReply(0, "", null));
    xhr.onerror = failed;
    xhr.ontimeout = failed;
    xhr.onabort = failed;
    xhr.send(args.file);
  });
}

/** 401 / 403 / 409 when this browser's account no longer matches the session; otherwise null. */
function fenceStatus(reply: Reply): 401 | 403 | 409 | null {
  if (reply.status === 403 && reply.code === "DEMO_ACCOUNT") return 403;
  if (mediaOutcome(reply.status, reply.code) !== "fenced") return null;
  if (reply.status === 401 || reply.code === "SIGNED_OUT") return 401;
  if (reply.status === 403) return 403;
  return 409;
}

function isItem(value: unknown): value is MediaItem {
  return !!value && typeof value === "object" && typeof (value as MediaItem).id === "string" && "draft" in value;
}
/** A write answers with the item itself; accept it wrapped as `{ item }` as well. */
function itemOf(body: Record<string, unknown>): MediaItem | null {
  if (isItem(body)) return body;
  return isItem(body.item) ? body.item : null;
}
function detailOf(body: Record<string, unknown>): MediaDetail | null {
  return isItem(body.item) && Array.isArray(body.versions) && body.preview && typeof body.preview === "object"
    ? (body as unknown as MediaDetail)
    : null;
}

// ---------------------------------------------------------------- text

function fmtBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}
const stateText = { unverified: "Awaiting review", published: "Published", withdrawn: "Withdrawn" } as const;
/** The state as the photographer reads it: a declined photo is no longer awaiting review. */
function statusOf(item: MediaItem) {
  return item.review?.decision === "declined" && item.state === "unverified" ? "Not accepted" : stateText[item.state];
}
function fileSummary(item: MediaItem) {
  const v = item.draft;
  return `v${v.version} · ${v.width}×${v.height} · ${fmtBytes(v.byteSize)}`;
}
function hasChangesWaiting(item: MediaItem) {
  return item.state === "published" && item.draftVersion !== item.publishedVersion;
}
function licenceStatus(version: MediaVersion) {
  if (hasAgreement(rightsOf(version))) return `Agreement ${AGREEMENT.version}`;
  return version.licence.licenceName ? `Licence: ${version.licence.licenceName}` : "Licence needed";
}
/** The saved licence and description of one version, as the form's base. */
function baseOf(version: MediaVersion): MediaLicence & { description: string | null; title: string | null } {
  return { ...version.licence, description: descriptionOf(version), title: titleOf(version) };
}
const blankValues: LicenceValues = { credit: "", licenceName: "", licenceUrl: "", sourceUrl: "", attributionText: "", description: "", title: "" };
const fieldLabels: Record<LicenceField, string> = {
  credit: "Credit",
  licenceName: "Licence name",
  licenceUrl: "Licence link",
  sourceUrl: "Source link",
  attributionText: "Attribution text",
};
const fieldHints: Record<LicenceField, string> = {
  credit: "How the photo should be credited, such as your name.",
  licenceName: "The licence or usage offer under which the photo may be published.",
  licenceUrl: "Optional. A web address for the licence terms.",
  sourceUrl: "Optional. Where the photo can be found online.",
  attributionText: "Optional. Any wording that must appear with the photo.",
};

function failureText(reply: Reply, fallback: string) {
  if (reply.code === "MEDIA_DECLINED")
    return "This photo was declined, so it can't be changed. The team's reason is shown above.";
  const outcome = mediaOutcome(reply.status, reply.code);
  if (outcome === "retryable")
    return reply.retryAfter
      ? `The service is busy. Try again in ${reply.retryAfter} seconds. Nothing was lost.`
      : "The service is busy or couldn't be reached. Check your connection and try again in a moment.";
  if (outcome === "conflict")
    return "Someone changed this photo while you were working. The latest details have been loaded; check them and try again.";
  return reply.error || fallback;
}
function fileRejectedText(reply: Reply) {
  if (reply.code === "TOO_LARGE" || reply.status === 413) return "This photo is larger than 5 MB. Choose a smaller JPEG or PNG.";
  if (reply.code === "UNSUPPORTED_TYPE" || reply.status === 415) return "This file isn't a JPEG or PNG photo. Choose a JPEG or PNG.";
  return "The photo couldn't be read as a valid JPEG or PNG within 4096 pixels a side. Choose another file.";
}

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
/** Formatted after mount so the server's and the browser's locale can't disagree. */
function When({ value, mounted, prefix = "" }: { value: string; mounted: boolean; prefix?: string }) {
  if (!mounted) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return (
    <time dateTime={value}>
      {prefix}
      {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)}
    </time>
  );
}

type Context = {
  sessionKey: string;
  /** False once the account, role or session no longer matches. */
  valid: () => boolean;
  /** Handles a refusal that ends the session or the role; true when it did. */
  fail: (reply: Reply) => boolean;
  say: (text: string) => void;
};

// ---------------------------------------------------------------- upload form

type UploadErrors = Partial<Record<SubmissionField | "description" | "confirm" | "file", string>>;
/** Form order, for focusing the first problem. */
const uploadFieldOrder = ["fullName", "credit", "instagramHandle", "instagramDisplayConsent", "title", "description", "file", "confirm"] as const;

/**
 * The client's photo submission form (2026-11-24). Sending it is the v2 statement: the three confirmations
 * must be ticked first. The description is saved with a PATCH right after the upload (Backend 0.29.0).
 */
function UploadForm({
  ctx,
  idPrefix,
  target,
  path,
  submitLabel,
  initial,
  onDone,
  onConflict,
}: {
  ctx: Context;
  idPrefix: string;
  target: UploadTarget;
  path: string;
  submitLabel: string;
  /** Details typed for this photo before (a new version), so they need not be typed again. */
  initial?: SubmissionValues;
  /** `descriptionSaved` is false when the photo arrived but its description could not be saved. */
  onDone: (item: MediaItem, descriptionSaved: boolean) => void;
  onConflict: () => void;
}) {
  const [values, setValues] = useState<SubmissionValues>(initial ?? blankSubmission);
  const [description, setDescription] = useState("");
  const [checks, setChecks] = useState<Confirmations>(noConfirmations);
  const [file, setFile] = useState<File | null>(null);
  const [contentType, setContentType] = useState<"image/jpeg" | "image/png" | null>(null);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<UploadErrors>({});
  const [problem, setProblem] = useState("");
  const [phase, setPhase] = useState<"idle" | "sending" | "checking" | "describing">("idle");
  const [progress, setProgress] = useState(0);
  // This form's own key lifecycle, so switching between create and version never re-mints the other's key.
  const [keys] = useState<UploadKeys>(() => createUploadKeys());
  const busy = useRef(false);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const alive = useRef(true);
  const picks = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const problemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      xhr.current?.abort();
    };
  }, []);
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);

  const focusId = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

  async function pick(selected: File | undefined) {
    const mine = ++picks.current;
    setErrors((old) => ({ ...old, file: undefined }));
    setProblem("");
    setFile(null);
    setContentType(null);
    setDims(null);
    setPreviewUrl(null);
    if (!selected) return;
    const result = await precheckImage(selected);
    if (mine !== picks.current || !alive.current) return;
    if (!result.ok) {
      setErrors((old) => ({ ...old, file: result.message }));
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(selected);
    setContentType(result.contentType);
    setDims(result.width && result.height ? { width: result.width, height: result.height } : null);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  function reset() {
    setValues(initial ?? blankSubmission);
    setDescription("");
    setChecks(noConfirmations);
    setFile(null);
    setContentType(null);
    setDims(null);
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  /** The description goes in a PATCH after the upload; true when there was none or it was saved. */
  async function saveDescription(item: MediaItem): Promise<boolean> {
    const text = normaliseDescription(description);
    if (!text) return true;
    setPhase("describing");
    const reply = await callMedia(ctx.sessionKey, `/api/media/${item.id}`, {
      method: "PATCH",
      json: { revision: item.revision, description: text },
    });
    return mediaOutcome(reply.status, reply.code) === "ok";
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || !ctx.valid()) return;
    const next: UploadErrors = { ...submissionErrors(values) };
    const descriptionProblem = descriptionErrors(description);
    if (descriptionProblem) next.description = descriptionProblem;
    if (!file || !contentType) next.file = errors.file ?? "Choose a JPEG or PNG photo to upload.";
    if (!allConfirmed(checks)) next.confirm = "Tick all three confirmations to submit your photo.";
    setErrors(next);
    const first = uploadFieldOrder.find((field) => next[field]);
    if (first || !file || !contentType) return void focusId(`${idPrefix}-${first ?? "file"}`);

    busy.current = true;
    setProblem("");
    setProgress(0);
    setPhase("sending");
    ctx.say("Uploading…");
    const submission = encodeSubmission(values);
    const reply = await sendFile({
      path,
      file,
      contentType,
      // A changed submission is a different upload: the backend refuses a key reused with other details.
      key: keys.keyFor(file, target, submission),
      statement: AGREEMENT.statement,
      submission,
      sessionKey: ctx.sessionKey,
      xhrRef: xhr,
      onProgress: (loaded, total) => alive.current && setProgress(Math.round((loaded / total) * 100)),
      onSent: () => {
        if (!alive.current) return;
        setPhase("checking");
        ctx.say("Checking the photo…");
      },
    });
    if (!alive.current) return void (busy.current = false);
    const outcome = mediaOutcome(reply.status, reply.code);
    keys.settle(outcome);
    if (!ctx.valid()) return void (busy.current = false);
    if (target !== "create" && reply.code === "FORBIDDEN") {
      // Not the owner (a staff caller): this is not a lost role.
      busy.current = false;
      setPhase("idle");
      ctx.say("");
      setProblem("Only the photographer who owns this photo can add versions.");
      requestAnimationFrame(() => problemRef.current?.focus());
      return;
    }
    if (ctx.fail(reply)) return void (busy.current = false);
    const item = outcome === "ok" ? itemOf(reply.body) : null;
    if (outcome === "ok" && item) {
      const described = await saveDescription(item);
      busy.current = false;
      if (!alive.current) return;
      setPhase("idle");
      reset();
      ctx.say("Photo received and checked.");
      onDone(item, described);
      return;
    }
    busy.current = false;
    setPhase("idle");
    ctx.say("");
    if (outcome === "fileRejected") {
      setErrors({ file: fileRejectedText(reply) });
      focusId(`${idPrefix}-file`);
      return;
    }
    if (outcome === "conflict") {
      setProblem(failureText(reply, ""));
      onConflict();
    } else if (outcome === "keyReused") {
      setProblem("That upload couldn't be completed. Try the upload again.");
    } else {
      setProblem(failureText(reply, "The photo couldn't be uploaded. Try again."));
    }
    requestAnimationFrame(() => problemRef.current?.focus());
  }

  const sending = phase !== "idle";
  const err = (key: "file" | "description") =>
    errors[key] ? (
      <span className="field-error" id={`${idPrefix}-${key}-error`}>
        {errors[key]}
      </span>
    ) : null;
  return (
    <form className="media-upload" onSubmit={(event) => void submit(event)} noValidate>
      <SubmissionFields
        idPrefix={idPrefix}
        values={values}
        errors={errors}
        disabled={sending}
        onChange={(change, field) => {
          setValues((old) => ({ ...old, ...change }));
          setErrors((old) => ({
            ...old,
            [field]: undefined,
            ...(field === "instagramHandle" ? { instagramDisplayConsent: undefined } : {}),
          }));
        }}
      />
      <div className="field media-description">
        <label htmlFor={`${idPrefix}-description`}>Photo description</label>
        <textarea
          id={`${idPrefix}-description`}
          rows={4}
          value={description}
          disabled={sending}
          aria-invalid={!!errors.description}
          aria-describedby={[`${idPrefix}-description-hint`, errors.description ? `${idPrefix}-description-error` : ""].filter(Boolean).join(" ")}
          onChange={(event) => {
            setDescription(event.target.value);
            setErrors((old) => ({ ...old, description: undefined }));
          }}
        />
        <small className="hint" id={`${idPrefix}-description-hint`}>
          Optional. What the photo shows. {[...normaliseDescription(description)].length} of {DESCRIPTION_MAX} characters.
        </small>
        {err("description")}
      </div>
      <div className="field media-file-field">
        <label htmlFor={`${idPrefix}-file`}>Photo (JPEG or PNG)</label>
        <input
          id={`${idPrefix}-file`}
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          disabled={sending}
          aria-invalid={!!errors.file}
          aria-describedby={[`${idPrefix}-file-hint`, errors.file ? `${idPrefix}-file-error` : ""].filter(Boolean).join(" ")}
          onChange={(event) => void pick(event.target.files?.[0])}
        />
        <small className="hint" id={`${idPrefix}-file-hint`}>
          Up to {MEDIA_MAX_BYTES / 1048576} MB and 4096 pixels on the longest side.
        </small>
        {err("file")}
      </div>
      {file && previewUrl && (
        <figure className="media-file-preview">
          <img src={previewUrl} alt={`Your chosen file: ${file.name}`} width={dims?.width} height={dims?.height} />
          <figcaption>
            Your chosen file · {fmtBytes(file.size)}
            {dims ? ` · ${dims.width}×${dims.height}` : ""}
          </figcaption>
        </figure>
      )}
      <AgreementChecks
        idPrefix={idPrefix}
        checked={checks}
        error={errors.confirm}
        disabled={sending}
        onChange={(next) => {
          setChecks(next);
          setErrors((old) => ({ ...old, confirm: undefined }));
        }}
      />
      {problem && (
        <div className="media-alert" role="alert" tabIndex={-1} ref={problemRef}>
          {problem}
        </div>
      )}
      <div className="media-actions">
        <button className="btn" type="submit" disabled={sending}>
          {phase === "sending"
            ? "Uploading…"
            : phase === "checking"
              ? "Checking the photo…"
              : phase === "describing"
                ? "Saving the description…"
                : submitLabel}
        </button>
        {sending && (
          <label className="media-progress">
            <span>{phase === "sending" ? `Uploading ${progress}%` : phase === "checking" ? "Checking the photo…" : "Saving the description…"}</span>
            {phase === "sending" ? <progress max={100} value={progress} /> : <progress />}
          </label>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- details

/** The private details stored on the item (Backend 0.29.0), as typed values. */
type PrivateValues = { fullName: string; instagramHandle: string; instagramDisplayConsent: boolean };
function privateOf(item: MediaItem): PrivateValues {
  return {
    fullName: item.submission?.fullName ?? "",
    instagramHandle: item.submission?.instagramHandle ?? "",
    instagramDisplayConsent: item.submission?.instagramDisplayConsent ?? false,
  };
}
/** Only what changed against the stored values; null when nothing did. */
function privateDiff(item: MediaItem, values: PrivateValues) {
  const stored = privateOf(item);
  const body: { fullName?: string | null; instagram?: { handle: string | null; displayConsent: boolean } } = {};
  const name = values.fullName.trim() || null;
  if (name !== (stored.fullName || null)) body.fullName = name;
  const handle = normaliseInstagramHandle(values.instagramHandle);
  const consent = handle !== null && values.instagramDisplayConsent;
  if (handle !== (stored.instagramHandle || null) || consent !== stored.instagramDisplayConsent)
    body.instagram = { handle, displayConsent: consent };
  return Object.keys(body).length ? body : null;
}

function PhotoDetail({
  ctx,
  id,
  onBack,
  onChanged,
}: {
  ctx: Context;
  id: string;
  onBack: () => void;
  onChanged: (item: MediaItem) => void;
}) {
  const mounted = useMounted();
  const [detail, setDetail] = useState<MediaDetail | null>(null);
  const [load, setLoad] = useState<"loading" | "ready" | "error" | "notfound">("loading");
  const [values, setValues] = useState<LicenceValues>(blankValues);
  const [errors, setErrors] = useState<Partial<Record<LicenceField | "description" | "title", string>>>({});
  const [prefilled, setPrefilled] = useState(false);
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [expired, setExpired] = useState(false);
  // Reads and writes have separate generations: a reload must not swallow a save's answer.
  const generation = useRef(0);
  const writeGeneration = useRef(0);
  /** The saved draft licence the form was last loaded or rebased from. */
  const loadedBase = useRef<(MediaLicence & { description: string | null; title: string | null }) | null>(null);
  // The agreement move (v1 or no statement → v2).
  const [agreeOpen, setAgreeOpen] = useState(false);
  const [agreeValues, setAgreeValues] = useState<SubmissionValues>(blankSubmission);
  const [agreeChecks, setAgreeChecks] = useState<Confirmations>(noConfirmations);
  const [agreeErrors, setAgreeErrors] = useState<Partial<Record<SubmissionField | "confirm", string>>>({});
  const [agreeing, setAgreeing] = useState(false);
  const [agreeProblem, setAgreeProblem] = useState("");
  const agreeProblemRef = useRef<HTMLDivElement>(null);
  const agreeButtonRef = useRef<HTMLButtonElement>(null);
  // Private details (full name, Instagram).
  const [privateValues, setPrivateValues] = useState<PrivateValues>({ fullName: "", instagramHandle: "", instagramDisplayConsent: false });
  const [privateErrors, setPrivateErrors] = useState<Partial<Record<"fullName" | "instagramHandle" | "instagramDisplayConsent", string>>>({});
  const [privateSaving, setPrivateSaving] = useState(false);
  const [privateProblem, setPrivateProblem] = useState("");
  const privateProblemRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const problemRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const focusHeading = useRef(true);
  const uid = useId().replace(/:/g, "");

  const reload = useCallback(
    async (opts: { reset: boolean; prefill?: LicenceValues }) => {
      const mine = ++generation.current;
      const reply = await callMedia(ctx.sessionKey, `/api/media/${id}`);
      if (mine !== generation.current || !ctx.valid()) return;
      if (ctx.fail(reply)) return;
      const next = reply.status === 200 ? detailOf(reply.body) : null;
      if (!next) {
        setLoad(reply.status === 404 ? "notfound" : "error");
        setProblem(reply.status === 404 ? "" : failureText(reply, "This photo couldn't be loaded."));
        return;
      }
      setDetail(next);
      setExpired(false);
      setLoad("ready");
      onChanged(next.item);
      setPrivateValues(privateOf(next.item));
      setPrivateErrors({});
      const newBase = baseOf(next.item.draft);
      const oldBase = loadedBase.current;
      loadedBase.current = newBase;
      if (opts.prefill) {
        setValues(opts.prefill);
        setPrefilled(true);
        setErrors({});
      } else if (opts.reset || !oldBase) {
        setValues(licenceToValues(newBase));
        setPrefilled(false);
        setErrors({});
      } else {
        // Untouched fields follow the new saved licence; typed text stays, so nothing of another editor's is reverted.
        setValues((typed) => rebaseLicence(oldBase, newBase, typed));
        setErrors({});
      }
    },
    [id, ctx, onChanged],
  );

  useEffect(() => {
    void reload({ reset: true });
    return () => {
      generation.current += 1;
    };
  }, [reload]);

  useEffect(() => {
    if (load !== "loading" && focusHeading.current) {
      focusHeading.current = false;
      headingRef.current?.focus();
    }
  }, [load]);

  const item = detail?.item ?? null;
  const base = item ? baseOf(item.draft) : null;
  const v2 = !!item && hasAgreement(rightsOf(item.draft));
  const declined = item?.review?.decision === "declined";
  const canAgree = !!item && canAcceptAgreement(item);
  // A draft with no statement at all (none, or the import's) that was never published can't be published yet.
  const needRights = !!item && needsRightsStatement(item);
  const shownFields = licenceFields.filter((field) => !v2 || (field !== "licenceName" && field !== "licenceUrl"));
  const busyAny = saving || agreeing || privateSaving;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!item || !base || busyAny) return;
    const found: Partial<Record<LicenceField | "description" | "title", string>> = licenceErrors(values);
    if (v2 && !found.credit && !values.credit.trim()) found.credit = "Add the photographer credit. It is shown with the photo.";
    const titleProblem = titleErrors(values.title ?? "", v2);
    if (titleProblem) found.title = titleProblem;
    const descriptionProblem = descriptionErrors(values.description ?? "");
    if (descriptionProblem) found.description = descriptionProblem;
    setErrors(found);
    const firstBad = ["title" as const, ...shownFields, "description" as const].find((field) => found[field]);
    if (firstBad) return void requestAnimationFrame(() => document.getElementById(`${uid}-${firstBad}`)?.focus());
    // A v2 photo's licence is the agreement: its name and link are never sent from here.
    const shown = v2 ? { ...values, licenceName: undefined, licenceUrl: undefined } : values;
    const diff = licenceDiff(base, shown as Partial<LicenceValues>);
    if ("none" in diff) {
      setProblem("");
      ctx.say("No changes to save.");
      return;
    }
    setSaving(true);
    setProblem("");
    ctx.say("Saving…");
    const mine = ++writeGeneration.current;
    const reply = await callMedia(ctx.sessionKey, `/api/media/${item.id}`, {
      method: "PATCH",
      json: { revision: item.revision, ...splitEdit(diff.changes) },
    });
    setSaving(false);
    if (mine !== writeGeneration.current || !ctx.valid()) return;
    if (ctx.fail(reply)) return;
    const outcome = mediaOutcome(reply.status, reply.code);
    if (outcome === "ok") {
      ctx.say("Photo details saved.");
      await reload({ reset: true });
      return;
    }
    ctx.say("");
    setProblem(failureText(reply, "The photo details couldn't be saved."));
    if (outcome === "conflict") {
      // Typed text is kept; untouched fields take the reloaded licence.
      await reload({ reset: false });
    }
    requestAnimationFrame(() => problemRef.current?.focus());
  }

  async function afterVersion(descriptionSaved: boolean) {
    setAdding(false);
    focusHeading.current = true;
    ctx.say(
      descriptionSaved
        ? "New version received and checked."
        : "New version received and checked, but its description couldn't be saved. Add it again below.",
    );
    // The backend made the new version from the details sent with it; show those.
    await reload({ reset: true });
    focusHeading.current = false;
    headingRef.current?.focus();
  }

  function openAgreement() {
    if (!item) return;
    setAgreeValues(submissionFrom(item));
    setAgreeChecks(noConfirmations);
    setAgreeErrors({});
    setAgreeProblem("");
    setAgreeOpen(true);
    requestAnimationFrame(() => document.getElementById(`${uid}-agree-fullName`)?.focus());
  }

  async function acceptAgreement(event: FormEvent) {
    event.preventDefault();
    if (!item || busyAny) return;
    const found: Partial<Record<SubmissionField | "confirm", string>> = { ...submissionErrors(agreeValues) };
    if (!allConfirmed(agreeChecks)) found.confirm = "Tick all three confirmations to accept the agreement.";
    setAgreeErrors(found);
    const first = (["fullName", "credit", "instagramHandle", "instagramDisplayConsent", "title", "confirm"] as const).find((f) => found[f]);
    if (first) return void requestAnimationFrame(() => document.getElementById(`${uid}-agree-${first}`)?.focus());
    setAgreeing(true);
    setAgreeProblem("");
    ctx.say("Saving your acceptance of the agreement…");
    const mine = ++writeGeneration.current;
    const reply = await callMedia(ctx.sessionKey, `/api/media/${item.id}/rights`, {
      method: "PUT",
      json: { revision: item.revision, statement: AGREEMENT.statement, submission: submissionOf(agreeValues) },
    });
    setAgreeing(false);
    if (mine !== writeGeneration.current || !ctx.valid()) return;
    if (ctx.fail(reply)) return;
    // Never resent: whatever the answer, the reload shows what is stored now (a lost answer may already have landed).
    let failed = false;
    if (mediaOutcome(reply.status, reply.code) === "ok") {
      setAgreeOpen(false);
      setAgreeChecks(noConfirmations);
      ctx.say(
        item.state === "published"
          ? "Agreement accepted. Your updated photo goes live once the team publishes it; until then the current version stays live."
          : "Agreement accepted for this photo.",
      );
    } else if (reply.code === "RIGHTS_ALREADY_STATED") {
      setAgreeOpen(false);
      ctx.say("The agreement was already accepted for this photo.");
    } else {
      failed = true;
      ctx.say("");
      setAgreeProblem(failureText(reply, "Your acceptance couldn't be saved."));
    }
    await reload({ reset: false });
    requestAnimationFrame(() => (failed ? agreeProblemRef.current : null)?.focus() ?? headingRef.current?.focus());
  }

  async function savePrivate(body: ReturnType<typeof privateDiff>, done: string) {
    if (!item || busyAny) return;
    if (!body) {
      setPrivateProblem("");
      ctx.say("No changes to save.");
      return;
    }
    setPrivateSaving(true);
    setPrivateProblem("");
    ctx.say("Saving…");
    const mine = ++writeGeneration.current;
    const reply = await callMedia(ctx.sessionKey, `/api/media/${item.id}`, {
      method: "PATCH",
      json: { revision: item.revision, ...body },
    });
    setPrivateSaving(false);
    if (mine !== writeGeneration.current || !ctx.valid()) return;
    if (ctx.fail(reply)) return;
    if (mediaOutcome(reply.status, reply.code) === "ok") {
      ctx.say(done);
      await reload({ reset: false });
      return;
    }
    ctx.say("");
    setPrivateProblem(failureText(reply, "Your details couldn't be saved."));
    await reload({ reset: false });
    requestAnimationFrame(() => privateProblemRef.current?.focus());
  }

  function submitPrivate(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    const found: typeof privateErrors = instagramErrors(privateValues.instagramHandle, privateValues.instagramDisplayConsent);
    if (privateValues.fullName.trim()) {
      const name = submissionErrors({ ...blankSubmission, title: "x", credit: "x", fullName: privateValues.fullName }).fullName;
      if (name) found.fullName = name;
    }
    setPrivateErrors(found);
    const first = (["fullName", "instagramHandle", "instagramDisplayConsent"] as const).find((f) => found[f]);
    if (first) return void requestAnimationFrame(() => document.getElementById(`${uid}-private-${first}`)?.focus());
    void savePrivate(privateDiff(item, privateValues), "Your details were saved.");
  }

  if (load === "loading")
    return (
      <section className="media-detail" aria-busy="true" aria-labelledby={`${uid}-title`}>
        <h2 id={`${uid}-title`} ref={headingRef} tabIndex={-1}>
          {id}
        </h2>
        <p>Loading this photo…</p>
      </section>
    );
  if (!item || !base || !detail)
    return (
      <section className="media-detail" aria-labelledby={`${uid}-title`}>
        <h2 id={`${uid}-title`} ref={headingRef} tabIndex={-1}>
          {id}
        </h2>
        <div className="media-alert" role="alert">
          {load === "notfound" ? "This photo wasn't found in your photos." : problem || "This photo couldn't be loaded."}
        </div>
        <div className="media-actions">
          {load === "error" && (
            <button className="btn" type="button" onClick={() => void reload({ reset: true })}>
              Try again
            </button>
          )}
          <button className="btn secondary" type="button" onClick={onBack}>
            Back to your photos
          </button>
        </div>
      </section>
    );

  const preview = detail.preview as ImageRef;
  const versions = [...detail.versions].reverse();
  const stored = privateOf(item);
  const hasPrivate = !!stored.fullName || !!stored.instagramHandle || stored.instagramDisplayConsent;
  const fieldError = (field: LicenceField | "title") =>
    errors[field] ? (
      <span className="field-error" id={`${uid}-${field}-error`}>
        {errors[field]}
      </span>
    ) : null;

  return (
    <section className="media-detail" aria-labelledby={`${uid}-title`}>
      <div className="media-detail-head">
        <button className="btn secondary" type="button" onClick={onBack}>
          Back to your photos
        </button>
        <h2 id={`${uid}-title`} ref={headingRef} tabIndex={-1}>
          {item.draft.title ? `${item.draft.title} · ` : ""}
          {item.id} · {statusOf(item)}
          {hasChangesWaiting(item) && <span className="media-badge">Changes waiting</span>}
          {item.review && <span className="media-badge">{reviewLabel[item.review.decision]}</span>}
        </h2>
      </div>
      {item.review && <ReviewNotice review={item.review} />}
      {item.state === "published" && !declined && <p className="media-note">Changes go live after the team reviews them.</p>}
      {!v2 && !declined && !base.licenceName && (
        <p className="media-prompt">
          Next step: accept the photo submission agreement below, or add the licence details. The team needs one of
          them before this photo can be published.
        </p>
      )}

      <div className="media-preview">
        {preview.url && !expired ? (
          <img
            src={preview.url}
            alt={`Draft version ${preview.version} of ${item.draft.title ?? item.id}`}
            width={preview.width}
            height={preview.height}
            referrerPolicy="no-referrer"
            onError={() => setExpired(true)}
          />
        ) : preview.url ? (
          <div className="media-placeholder" role="alert">
            <p>The preview link has expired. Reload this photo.</p>
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                focusHeading.current = false;
                void reload({ reset: false });
              }}
            >
              Reload this photo
            </button>
          </div>
        ) : (
          <div className="media-placeholder">
            <p>Preview isn&apos;t available on this server. The photo was received and checked.</p>
          </div>
        )}
        <p className="media-meta">
          {fileSummary(item)} · {item.draft.contentType === "image/png" ? "PNG" : "JPEG"}
        </p>
        <p className="media-meta">
          {v2
            ? `You accepted the ${AGREEMENT.name} (${AGREEMENT.version}) for this version.`
            : hasV1Statement(rightsOf(item.draft))
              ? "This version was sent under the earlier photo terms."
              : "No rights statement has been given for this version yet."}
        </p>
      </div>

      {canAgree && (
        <section className="media-rights" aria-labelledby={`${uid}-agree-title`}>
          <h3 id={`${uid}-agree-title`}>Accept the new agreement for this photo</h3>
          <p className="media-meta">
            {needRights
              ? "The team can only publish this photo once you accept the photo submission agreement for it."
              : `This photo was sent under the earlier terms. Accepting the ${AGREEMENT.name} makes a new draft of it with these details.`}
            {item.state === "published" ? " The version that is live now stays live until the team publishes the new one." : ""}
          </p>
          {agreeOpen ? (
            <form className="media-upload" onSubmit={(event) => void acceptAgreement(event)} noValidate>
              <SubmissionFields
                idPrefix={`${uid}-agree`}
                values={agreeValues}
                errors={agreeErrors}
                disabled={agreeing}
                onChange={(change, field) => {
                  setAgreeValues((old) => ({ ...old, ...change }));
                  setAgreeErrors((old) => ({
                    ...old,
                    [field]: undefined,
                    ...(field === "instagramHandle" ? { instagramDisplayConsent: undefined } : {}),
                  }));
                }}
              />
              <AgreementChecks
                idPrefix={`${uid}-agree`}
                checked={agreeChecks}
                error={agreeErrors.confirm}
                disabled={agreeing}
                onChange={(next) => {
                  setAgreeChecks(next);
                  setAgreeErrors((old) => ({ ...old, confirm: undefined }));
                }}
              />
              {agreeProblem && (
                <div className="media-alert" role="alert" tabIndex={-1} ref={agreeProblemRef}>
                  {agreeProblem}
                </div>
              )}
              <div className="media-actions">
                <button className="btn" type="submit" disabled={busyAny}>
                  {agreeing ? "Saving…" : "Accept the agreement"}
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={agreeing}
                  onClick={() => {
                    setAgreeOpen(false);
                    requestAnimationFrame(() => agreeButtonRef.current?.focus());
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              {agreeProblem && (
                <div className="media-alert" role="alert" tabIndex={-1} ref={agreeProblemRef}>
                  {agreeProblem}
                </div>
              )}
              <button className="btn" type="button" ref={agreeButtonRef} disabled={busyAny} onClick={openAgreement}>
                Accept the new agreement for this photo
              </button>
            </>
          )}
        </section>
      )}

      {declined ? (
        <div className="media-licence">
          <h3>Photo details</h3>
          <p className="media-meta">
            {item.draft.title ? `Title: ${item.draft.title}. ` : ""}
            {item.draft.licence.credit ? `Credit: ${item.draft.licence.credit}.` : ""}
          </p>
        </div>
      ) : (
        <form className="media-licence" onSubmit={(event) => void save(event)} noValidate>
          <h3>{v2 ? "Photo details and credit" : "Licence and credit"}</h3>
          {prefilled && (
            <p className="media-prompt">
              This is a new version. Your earlier details are filled in below but not saved yet. Check them, then save.
            </p>
          )}
          {v2 && (
            <p className="media-meta">
              Licence: {item.draft.licence.licenceName ?? `${AGREEMENT.name} (${AGREEMENT.version})`}. It is set by the
              agreement you accepted.
            </p>
          )}
          <div className="form-grid">
            <div className="field full">
              <label htmlFor={`${uid}-title`}>
                Photo title
                {v2 && <span className="media-needed"> · Required</span>}
              </label>
              <input
                id={`${uid}-title`}
                type="text"
                autoComplete="off"
                value={values.title ?? ""}
                onChange={(event) => setValues((old) => ({ ...old, title: event.target.value }))}
                aria-invalid={!!errors.title}
                aria-describedby={errors.title ? `${uid}-title-error` : undefined}
              />
              {fieldError("title")}
            </div>
            {shownFields.map((field) => {
              const needed = field === "licenceName" || (field === "credit" && (v2 || base.creditRequired));
              const hintId = `${uid}-${field}-hint`;
              return (
                <div className={`field ${field === "attributionText" ? "full" : ""}`} key={field}>
                  <label htmlFor={`${uid}-${field}`}>
                    {v2 && field === "credit" ? "Photographer credit (public)" : fieldLabels[field]}
                    {needed && <span className="media-needed"> · {v2 ? "Required" : "Needed before publishing"}</span>}
                  </label>
                  <input
                    id={`${uid}-${field}`}
                    type="text"
                    inputMode={field === "licenceUrl" || field === "sourceUrl" ? "url" : undefined}
                    autoComplete="off"
                    value={values[field]}
                    onChange={(event) => setValues((old) => ({ ...old, [field]: event.target.value }))}
                    aria-invalid={!!errors[field]}
                    aria-describedby={[hintId, errors[field] ? `${uid}-${field}-error` : ""].filter(Boolean).join(" ")}
                  />
                  <small className="hint" id={hintId}>
                    {fieldHints[field]}
                  </small>
                  {fieldError(field)}
                </div>
              );
            })}
          </div>
          <div className="field media-description">
            <label htmlFor={`${uid}-description`}>Description</label>
            <textarea
              id={`${uid}-description`}
              rows={5}
              value={values.description ?? ""}
              onChange={(event) => setValues((old) => ({ ...old, description: event.target.value }))}
              aria-invalid={!!errors.description}
              aria-describedby={[`${uid}-description-hint`, errors.description ? `${uid}-description-error` : ""].filter(Boolean).join(" ")}
            />
            <small className="hint" id={`${uid}-description-hint`}>
              Optional. What the photo shows. Line breaks are fine. {[...normaliseDescription(values.description ?? "")].length} of {DESCRIPTION_MAX} characters.
            </small>
            {errors.description && (
              <span className="field-error" id={`${uid}-description-error`}>
                {errors.description}
              </span>
            )}
          </div>
          {!v2 && (
            <p className="media-meta">
              {base.creditRequired
                ? "A credit is required for this photo. The team sets this."
                : "A credit isn't required for this photo. The team sets this."}
            </p>
          )}
          {problem && (
            <div className="media-alert" role="alert" tabIndex={-1} ref={problemRef}>
              {problem}
            </div>
          )}
          <div className="media-actions">
            <button className="btn" type="submit" disabled={busyAny}>
              {saving ? "Saving…" : v2 ? "Save photo details" : "Save licence details"}
            </button>
          </div>
        </form>
      )}

      {declined ? (
        hasPrivate && (
          <div className="media-licence">
            <h3>Your private details</h3>
            <p className="media-meta">
              You can remove your full name and Instagram details from this photo. Only the team could see them.
            </p>
            {privateProblem && (
              <div className="media-alert" role="alert" tabIndex={-1} ref={privateProblemRef}>
                {privateProblem}
              </div>
            )}
            <div className="media-actions">
              <button
                className="btn secondary"
                type="button"
                disabled={busyAny}
                onClick={() =>
                  void savePrivate(
                    privateDiff(item, { fullName: "", instagramHandle: "", instagramDisplayConsent: false }),
                    "Your name and Instagram details were removed from this photo.",
                  )
                }
              >
                {privateSaving ? "Removing…" : "Remove my name and Instagram details"}
              </button>
            </div>
          </div>
        )
      ) : (
        (v2 || hasPrivate) && (
          <form className="media-licence" onSubmit={submitPrivate} noValidate>
            <h3>Your private details</h3>
            <p className="media-meta">
              Only the Airplane Games team sees your full name. Your Instagram handle is shown publicly only while the
              box is ticked; untick it at any time.
            </p>
            <div className="form-grid">
              <div className="field">
                <label htmlFor={`${uid}-private-fullName`}>Full name (private)</label>
                <input
                  id={`${uid}-private-fullName`}
                  type="text"
                  autoComplete="name"
                  value={privateValues.fullName}
                  onChange={(event) => setPrivateValues((old) => ({ ...old, fullName: event.target.value }))}
                  aria-invalid={!!privateErrors.fullName}
                  aria-describedby={[`${uid}-private-fullName-hint`, privateErrors.fullName ? `${uid}-private-fullName-error` : ""].filter(Boolean).join(" ")}
                />
                <small className="hint" id={`${uid}-private-fullName-hint`}>
                  {v2 ? "The team needs your name before it can publish this photo." : "Optional."}
                </small>
                {privateErrors.fullName && (
                  <span className="field-error" id={`${uid}-private-fullName-error`}>
                    {privateErrors.fullName}
                  </span>
                )}
              </div>
              <div className="field">
                <label htmlFor={`${uid}-private-instagramHandle`}>Instagram handle (optional)</label>
                <input
                  id={`${uid}-private-instagramHandle`}
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={privateValues.instagramHandle}
                  onChange={(event) => {
                    setPrivateValues((old) => ({ ...old, instagramHandle: event.target.value }));
                    setPrivateErrors((old) => ({ ...old, instagramHandle: undefined, instagramDisplayConsent: undefined }));
                  }}
                  aria-invalid={!!privateErrors.instagramHandle}
                  aria-describedby={privateErrors.instagramHandle ? `${uid}-private-instagramHandle-error` : undefined}
                />
                {privateErrors.instagramHandle && (
                  <span className="field-error" id={`${uid}-private-instagramHandle-error`}>
                    {privateErrors.instagramHandle}
                  </span>
                )}
              </div>
              <div className="field full">
                <label className="check-label">
                  <input
                    id={`${uid}-private-instagramDisplayConsent`}
                    type="checkbox"
                    checked={privateValues.instagramDisplayConsent}
                    onChange={(event) => {
                      setPrivateValues((old) => ({ ...old, instagramDisplayConsent: event.target.checked }));
                      setPrivateErrors((old) => ({ ...old, instagramDisplayConsent: undefined }));
                    }}
                    aria-invalid={!!privateErrors.instagramDisplayConsent}
                    aria-describedby={privateErrors.instagramDisplayConsent ? `${uid}-private-instagramDisplayConsent-error` : undefined}
                  />
                  <span>{AGREEMENT.instagramConsent}</span>
                </label>
                {privateErrors.instagramDisplayConsent && (
                  <span className="field-error" id={`${uid}-private-instagramDisplayConsent-error`}>
                    {privateErrors.instagramDisplayConsent}
                  </span>
                )}
              </div>
            </div>
            {privateProblem && (
              <div className="media-alert" role="alert" tabIndex={-1} ref={privateProblemRef}>
                {privateProblem}
              </div>
            )}
            <div className="media-actions">
              <button className="btn" type="submit" disabled={busyAny}>
                {privateSaving ? "Saving…" : "Save my details"}
              </button>
            </div>
          </form>
        )
      )}

      <div className="media-versions">
        <h3>Versions</h3>
        <ul>
          {versions.map((version) => (
            <li key={version.version}>
              <b>Version {version.version}</b>
              {version.version === item.draftVersion && " · latest draft"}
              {version.version === item.publishedVersion && " · live"} · {version.width}×{version.height} ·{" "}
              {fmtBytes(version.byteSize)}
              {hasAgreement(rightsOf(version)) ? ` · agreement ${AGREEMENT.version}` : ""} ·{" "}
              <When value={version.createdAt} mounted={mounted} prefix="added " />
            </li>
          ))}
        </ul>
        {declined ? null : adding ? (
          <div className="media-add">
            <h3>Add a new version</h3>
            <p className="media-meta">
              Upload a replacement file. It starts as the latest draft, and the team reviews it before it goes live.
            </p>
            <UploadForm
              ctx={ctx}
              idPrefix={`${uid}-ver`}
              target={`version:${item.id}`}
              path={`/api/media/${item.id}/versions?revision=${item.revision}`}
              submitLabel="Upload new version"
              initial={submissionFrom(item)}
              onDone={(_, described) => void afterVersion(described)}
              onConflict={() => void reload({ reset: false })}
            />
            <div className="media-actions">
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  setAdding(false);
                  requestAnimationFrame(() => addRef.current?.focus());
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="btn secondary" type="button" ref={addRef} onClick={() => setAdding(true)}>
            Add a new version
          </button>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- workspace

export function MediaContribute({ sessionKey }: { sessionKey: string }) {
  const accountSession = useAccountSession();
  const accountRef = useRef(accountSession);
  accountRef.current = accountSession;
  const mounted = useMounted();
  const [blockedAccess, setBlockedAccess] = useState<number | null>(null);
  const blockedRef = useRef<number | null>(null);
  const [roleLost, setRoleLost] = useState(false);
  const [say, setSay] = useState({ text: "", n: 0 });
  const [items, setItems] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [load, setLoad] = useState<"loading" | "ready" | "error">("loading");
  const [listProblem, setListProblem] = useState("");
  const [more, setMore] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const generation = useRef(0);
  const opener = useRef("");
  const listHeadingRef = useRef<HTMLHeadingElement>(null);

  const sessionMatches =
    accountSession.state === "ready" &&
    !!accountSession.account?.user &&
    accountSession.account.sessionKey === sessionKey &&
    blockedAccess === null &&
    !roleLost;
  const matchesRef = useRef(sessionMatches);
  matchesRef.current = sessionMatches;

  const sayText = useCallback((text: string) => setSay((old) => ({ text, n: old.n + 1 })), []);

  const clearPrivate = useCallback(() => {
    generation.current += 1;
    setItems([]);
    setCursor(null);
    setOpenId(null);
  }, []);

  const fail = useCallback(
    (reply: Reply) => {
      const status = fenceStatus(reply);
      if (status !== null) {
        blockedRef.current = status;
        setBlockedAccess(status);
        clearPrivate();
        accountRef.current.reportAccess(status);
        return true;
      }
      if (mediaOutcome(reply.status, reply.code) === "roleLost") {
        setRoleLost(true);
        clearPrivate();
        return true;
      }
      return false;
    },
    [clearPrivate],
  );

  const ctx = useMemo<Context>(
    () => ({
      sessionKey,
      valid: () => matchesRef.current,
      fail,
      say: sayText,
    }),
    [sessionKey, fail, sayText],
  );

  const loadList = useCallback(
    async (after: string | null) => {
      const mine = ++generation.current;
      if (after) setMore(true);
      else setLoad("loading");
      const reply = await callMedia(sessionKey, after ? `/api/media?cursor=${encodeURIComponent(after)}` : "/api/media");
      if (mine !== generation.current || !matchesRef.current) return;
      setMore(false);
      if (fail(reply)) return;
      const page = reply.status === 200 ? (reply.body as unknown as MediaList) : null;
      if (!page || !Array.isArray(page.items)) {
        if (after && reply.status === 400) return void loadList(null); // a stale cursor: start again
        setListProblem(failureText(reply, "Your photos couldn't be loaded."));
        if (!after) setLoad("error");
        return;
      }
      setListProblem("");
      setItems((old) => (after ? [...old, ...page.items.filter((n) => !old.some((o) => o.id === n.id))] : page.items));
      setCursor(page.nextCursor);
      setLoad("ready");
    },
    [sessionKey, fail],
  );

  const started = useRef(false);
  useEffect(() => {
    // The first load only; later loads are explicit.
    if (!sessionMatches || started.current) return;
    started.current = true;
    void loadList(null);
  }, [sessionMatches, loadList]);

  const patchItem = useCallback((next: MediaItem) => {
    setItems((old) => (old.some((o) => o.id === next.id) ? old.map((o) => (o.id === next.id ? next : o)) : [next, ...old]));
  }, []);

  function open(id: string) {
    opener.current = id;
    setOpenId(id);
  }
  function back() {
    const id = opener.current;
    setOpenId(null);
    requestAnimationFrame(() => {
      const target = id ? document.querySelector<HTMLElement>(`[data-media-opener="${CSS.escape(id)}"]`) : null;
      (target ?? listHeadingRef.current)?.focus();
    });
  }

  const gate = !sessionMatches;
  return (
    <main id="main" className="wrap contribute-root media-root">
      <section className="page-intro">
        <p className="eyebrow">Calling all aviation photographers</p>
        <h1>Your Best Shot Deserves Some Air Time.</h1>
        <p>
          Send photos of aircraft and airports to the Airplane Games team. Every photo is checked and reviewed before any
          use, and it is used only under the photo submission agreement, with the credit you give for it. Nothing is
          played or sold here: the games live in the mobile app.
        </p>
      </section>
      <div className="media-status" role="status" aria-live="polite">
        {say.text}
        {say.n % 2 ? " " : ""}
      </div>

      {gate ? (
        <section className="signin-panel account-session-gate" role={roleLost || blockedAccess === 403 ? "alert" : undefined}>
          <ImageSquare size={28} weight="duotone" aria-hidden="true" />
          <h2>
            {roleLost
              ? "Photographer access has changed"
              : accountSession.state === "error"
                ? "Account check unavailable"
                : accountSession.state === "loading"
                  ? "Checking account…"
                  : blockedAccess === 403
                    ? "Account access changed"
                    : !accountSession.account?.user || blockedAccess === 401
                      ? "Sign in to continue"
                      : "Account session changed"}
          </h2>
          <p>
            {roleLost
              ? "This account is no longer allowed to send photos. Reload the page to see its current access."
              : accountSession.state === "error"
                ? "We could not confirm your account. Retry the check before opening your photos."
                : accountSession.state === "loading"
                  ? "Confirming your account before loading your photos."
                  : blockedAccess === 403
                    ? "This account can no longer access these photos."
                    : "Your photo list was cleared. Sign in again or reload the page to continue."}
          </p>
          <AccountActions
            className="actions account-session-actions"
            onRetry={accountSession.state === "error" && !roleLost ? () => void accountSession.refresh() : undefined}
            signInHref={
              !roleLost &&
              (!accountSession.account?.user ||
                blockedAccess === 401 ||
                (accountSession.account?.sessionKey && accountSession.account.sessionKey !== sessionKey))
                ? accountSignInPath("/contribute")
                : null
            }
            reloadLabel="Reload page"
          />
        </section>
      ) : (
        <>
          <div hidden={!!openId}>
            <section className="media-panel" aria-labelledby="media-upload-title">
              <h2 id="media-upload-title">Send a photo</h2>
              <p className="media-meta">Nothing goes live until the team has reviewed it.</p>
              <UploadForm
                ctx={ctx}
                idPrefix="media-new"
                target="create"
                path="/api/media"
                submitLabel={AGREEMENT.submitLabel}
                onDone={(item, described) => {
                  patchItem(item);
                  ctx.say(
                    described
                      ? "Photo received and checked. The team reviews it before it goes live."
                      : "Photo received and checked, but its description couldn't be saved. Add it on the photo's page.",
                  );
                  open(item.id);
                }}
                onConflict={() => undefined}
              />
            </section>

            <section className="media-panel" aria-labelledby="media-list-title" aria-busy={load === "loading"}>
              <h2 id="media-list-title" ref={listHeadingRef} tabIndex={-1}>
                Your photos
              </h2>
              {listProblem && (
                <div className="media-alert" role="alert">
                  {listProblem}
                </div>
              )}
              {load === "loading" ? (
                <p className="media-meta">Loading your photos…</p>
              ) : items.length ? (
                <ul className="media-list">
                  {items.map((item) => (
                    <li key={item.id} className="media-row">
                      <div className="media-row-main">
                        <button
                          type="button"
                          className="media-open"
                          data-media-opener={item.id}
                          onClick={() => open(item.id)}
                        >
                          {item.draft.title ?? item.id}
                          <span className="visually-hidden">, open details</span>
                        </button>
                        <span className="media-state">{statusOf(item)}</span>
                        {hasChangesWaiting(item) && <span className="media-badge">Changes waiting</span>}
                        {item.review && <span className="media-badge">{reviewLabel[item.review.decision]}</span>}
                      </div>
                      <p className="media-meta">
                        {fileSummary(item)} · {licenceStatus(item.draft)}
                        {mounted && " · "}
                        <When value={item.updatedAt} mounted={mounted} prefix="updated " />
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                load === "ready" && <p className="media-meta">You haven&apos;t sent any photos yet.</p>
              )}
              {load === "error" && (
                <div className="media-actions">
                  <button className="btn secondary" type="button" onClick={() => void loadList(null)}>
                    Try again
                  </button>
                </div>
              )}
              {cursor && (
                <div className="media-actions">
                  <button className="btn secondary" type="button" disabled={more} onClick={() => void loadList(cursor)}>
                    {more ? "Loading…" : "Show more"}
                  </button>
                </div>
              )}
            </section>
          </div>
          {openId && <PhotoDetail key={openId} ctx={ctx} id={openId} onBack={back} onChanged={patchItem} />}
        </>
      )}
    </main>
  );
}
