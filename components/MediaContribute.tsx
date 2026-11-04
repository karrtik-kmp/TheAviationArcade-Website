"use client";

import { ImageSquare } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AccountActions } from "@/components/AccessGate";
import { useAccountSession } from "@/components/AccountSession";
import { accountHeaders, accountSignInPath } from "@/lib/account";
import {
  MEDIA_MAX_BYTES,
  RIGHTS_STATEMENT,
  createUploadKeys,
  descriptionErrors,
  descriptionOf,
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
  type RightsChoice,
  type UploadKeys,
  type UploadTarget,
} from "@/lib/media-form";
import { sitePath } from "@/lib/paths";
import type { ImageRef, MediaDetail, MediaItem, MediaLicence, MediaList, MediaVersion } from "@/lib/request/media";
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
  /** `v1_own` or `v1_authorised`, sent with the file. */
  statement: string;
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
function fileSummary(item: MediaItem) {
  const v = item.draft;
  return `v${v.version} · ${v.width}×${v.height} · ${fmtBytes(v.byteSize)}`;
}
function hasChangesWaiting(item: MediaItem) {
  return item.state === "published" && item.draftVersion !== item.publishedVersion;
}
function licenceStatus(licence: MediaLicence) {
  return licence.licenceName ? `Licence: ${licence.licenceName}` : "Licence needed";
}
/** The saved licence and description of one version, as the form's base. */
function baseOf(version: MediaVersion): MediaLicence & { description: string | null } {
  return { ...version.licence, description: descriptionOf(version) };
}
function toValues(version: MediaVersion): LicenceValues {
  return licenceToValues(baseOf(version));
}
const blankValues: LicenceValues = { credit: "", licenceName: "", licenceUrl: "", sourceUrl: "", attributionText: "", description: "" };
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

function UploadForm({
  ctx,
  idPrefix,
  target,
  path,
  submitLabel,
  onDone,
  onConflict,
}: {
  ctx: Context;
  idPrefix: string;
  target: UploadTarget;
  path: string;
  submitLabel: string;
  onDone: (item: MediaItem) => void;
  onConflict: () => void;
}) {
  const [choice, setChoice] = useState<RightsChoice | "">("");
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [contentType, setContentType] = useState<"image/jpeg" | "image/png" | null>(null);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ rights?: string; consent?: string; file?: string }>({});
  const [problem, setProblem] = useState("");
  const [phase, setPhase] = useState<"idle" | "sending" | "checking">("idle");
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || !ctx.valid()) return;
    const next: typeof errors = {};
    if (!choice) next.rights = "Choose who holds the rights to this photo.";
    if (!consent) next.consent = "Confirm the statement to upload.";
    if (!file || !contentType) next.file = errors.file ?? "Choose a JPEG or PNG photo to upload.";
    setErrors(next);
    if (next.rights) return void focusId(`${idPrefix}-rights-own`);
    if (next.consent) return void focusId(`${idPrefix}-consent`);
    if (next.file || !file || !contentType || !choice) return void focusId(`${idPrefix}-file`);

    busy.current = true;
    setProblem("");
    setProgress(0);
    setPhase("sending");
    ctx.say("Uploading…");
    const reply = await sendFile({
      path,
      file,
      contentType,
      key: keys.keyFor(file, target, choice),
      statement: choice,
      sessionKey: ctx.sessionKey,
      xhrRef: xhr,
      onProgress: (loaded, total) => alive.current && setProgress(Math.round((loaded / total) * 100)),
      onSent: () => {
        if (!alive.current) return;
        setPhase("checking");
        ctx.say("Checking the photo…");
      },
    });
    busy.current = false;
    if (!alive.current) return;
    setPhase("idle");
    const outcome = mediaOutcome(reply.status, reply.code);
    keys.settle(outcome);
    if (!ctx.valid()) return;
    if (target !== "create" && reply.code === "FORBIDDEN") {
      // Not the owner (a staff caller): this is not a lost role.
      ctx.say("");
      setProblem("Only the photographer who owns this photo can add versions.");
      requestAnimationFrame(() => problemRef.current?.focus());
      return;
    }
    if (ctx.fail(reply)) return;
    const item = outcome === "ok" ? itemOf(reply.body) : null;
    if (outcome === "ok" && item) {
      setChoice("");
      setConsent(false);
      setFile(null);
      setContentType(null);
      setDims(null);
      setPreviewUrl(null);
      if (fileRef.current) fileRef.current.value = "";
      ctx.say("Photo received and checked.");
      onDone(item);
      return;
    }
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
  const err = (key: "rights" | "consent" | "file") =>
    errors[key] ? (
      <span className="field-error" id={`${idPrefix}-${key}-error`}>
        {errors[key]}
      </span>
    ) : null;
  return (
    <form className="media-upload" onSubmit={(event) => void submit(event)} noValidate>
      <fieldset className="media-fieldset" aria-describedby={errors.rights ? `${idPrefix}-rights-error` : undefined}>
        <legend>{RIGHTS_STATEMENT.question}</legend>
        {RIGHTS_STATEMENT.options.map((option, index) => (
          <label className="check-label" key={option.id}>
            <input
              id={index === 0 ? `${idPrefix}-rights-own` : undefined}
              type="radio"
              name={`${idPrefix}-rights`}
              checked={choice === option.id}
              disabled={sending}
              onChange={() => {
                setChoice(option.id);
                setErrors((old) => ({ ...old, rights: undefined }));
              }}
            />
            <span>{option.label}</span>
          </label>
        ))}
        {err("rights")}
      </fieldset>
      <div className="media-consent">
        <label className="check-label">
          <input
            id={`${idPrefix}-consent`}
            type="checkbox"
            checked={consent}
            disabled={sending}
            aria-invalid={!!errors.consent}
            aria-describedby={errors.consent ? `${idPrefix}-consent-error` : undefined}
            onChange={(event) => {
              setConsent(event.target.checked);
              setErrors((old) => ({ ...old, consent: undefined }));
            }}
          />
          <span>{RIGHTS_STATEMENT.consent}</span>
        </label>
        {err("consent")}
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
          <img
            src={previewUrl}
            alt={`Your chosen file: ${file.name}`}
            width={dims?.width}
            height={dims?.height}
          />
          <figcaption>
            Your chosen file · {fmtBytes(file.size)}
            {dims ? ` · ${dims.width}×${dims.height}` : ""}
          </figcaption>
        </figure>
      )}
      {problem && (
        <div className="media-alert" role="alert" tabIndex={-1} ref={problemRef}>
          {problem}
        </div>
      )}
      <div className="media-actions">
        <button className="btn" type="submit" disabled={sending}>
          {phase === "sending" ? "Uploading…" : phase === "checking" ? "Checking the photo…" : submitLabel}
        </button>
        {sending && (
          <label className="media-progress">
            <span>{phase === "checking" ? "Checking the photo…" : `Uploading ${progress}%`}</span>
            {phase === "sending" ? <progress max={100} value={progress} /> : <progress />}
          </label>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- details

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
  const [errors, setErrors] = useState<Partial<Record<LicenceField | "description", string>>>({});
  const [prefilled, setPrefilled] = useState(false);
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [expired, setExpired] = useState(false);
  // Reads and writes have separate generations: a reload must not swallow a save's answer.
  const generation = useRef(0);
  const writeGeneration = useRef(0);
  /** The saved draft licence the form was last loaded or rebased from. */
  const loadedBase = useRef<(MediaLicence & { description: string | null }) | null>(null);
  const [formChoice, setFormChoice] = useState<RightsChoice | "">("");
  const [formConsent, setFormConsent] = useState(false);
  const [rightsErrors, setRightsErrors] = useState<{ rights?: string; consent?: string }>({});
  const [stating, setStating] = useState(false);
  const [rightsProblem, setRightsProblem] = useState("");
  const rightsProblemRef = useRef<HTMLDivElement>(null);
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

  // A draft with no v1 statement (none, or the import's) that was never published needs one stated, whatever the item's state.
  const needRights = !!item && needsRightsStatement(item);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!item || !base || saving || stating) return;
    const found: Partial<Record<LicenceField | "description", string>> = licenceErrors(values);
    const descriptionProblem = descriptionErrors(values.description ?? "");
    if (descriptionProblem) found.description = descriptionProblem;
    setErrors(found);
    const firstBad = [...licenceFields, "description" as const].find((field) => found[field]);
    if (firstBad) return void requestAnimationFrame(() => document.getElementById(`${uid}-${firstBad}`)?.focus());
    const diff = licenceDiff(base, values);
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
      ctx.say("Licence details saved.");
      await reload({ reset: true });
      return;
    }
    ctx.say("");
    setProblem(failureText(reply, "The licence details couldn't be saved."));
    if (outcome === "conflict") {
      // Typed text is kept; untouched fields take the reloaded licence.
      await reload({ reset: false });
    }
    requestAnimationFrame(() => problemRef.current?.focus());
  }

  async function afterVersion() {
    setAdding(false);
    focusHeading.current = true;
    ctx.say("New version received and checked. Your earlier licence details are filled in below, not yet saved.");
    // Prefill from the saved licence of the draft as it was before this upload.
    await reload({ reset: false, prefill: item ? toValues(item.draft) : undefined });
    focusHeading.current = false;
    headingRef.current?.focus();
  }

  async function stateRights(event: FormEvent) {
    event.preventDefault();
    if (!item || stating || saving) return;
    const missing: typeof rightsErrors = {};
    if (!formChoice) missing.rights = "Choose who holds the rights to this photo.";
    if (!formConsent) missing.consent = "Confirm the statement to continue.";
    setRightsErrors(missing);
    if (missing.rights) return void requestAnimationFrame(() => document.getElementById(`${uid}-lrights-own`)?.focus());
    if (missing.consent) return void requestAnimationFrame(() => document.getElementById(`${uid}-lconsent`)?.focus());
    setStating(true);
    setRightsProblem("");
    ctx.say("Saving your rights statement…");
    const mine = ++writeGeneration.current;
    const reply = await callMedia(ctx.sessionKey, `/api/media/${item.id}/rights`, {
      method: "PUT",
      json: { revision: item.revision, statement: formChoice },
    });
    setStating(false);
    if (mine !== writeGeneration.current || !ctx.valid()) return;
    if (ctx.fail(reply)) return;
    // Never resent: whatever the answer, the reload shows what is stored now.
    let failed = false;
    if (mediaOutcome(reply.status, reply.code) === "ok") {
      setFormChoice("");
      setFormConsent(false);
      ctx.say("Rights statement saved.");
    } else if (reply.code === "RIGHTS_ALREADY_STATED") {
      ctx.say("Rights were already stated for this photo.");
    } else if (reply.code === "VERSION_CONFLICT") {
      failed = true;
      ctx.say("");
      setRightsProblem("Someone changed this photo while you were working. The latest details are loaded; check them and try again.");
    } else {
      failed = true;
      ctx.say("");
      setRightsProblem(failureText(reply, "Your rights statement couldn't be saved."));
    }
    await reload({ reset: false });
    // The form may have unmounted: land on the heading, or on the error when one is shown.
    requestAnimationFrame(() => (failed ? rightsProblemRef.current : null)?.focus() ?? headingRef.current?.focus());
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
  const fieldError = (field: LicenceField) =>
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
          {item.id} · {stateText[item.state]}
          {hasChangesWaiting(item) && <span className="media-badge">Changes waiting</span>}
        </h2>
      </div>
      {item.state === "published" && <p className="media-note">Changes go live after the team reviews them.</p>}
      {!base.licenceName && (
        <p className="media-prompt">
          Next step: add the licence details below. The team needs a licence name before this photo can be published.
        </p>
      )}

      <div className="media-preview">
        {preview.url && !expired ? (
          <img
            src={preview.url}
            alt={`Draft version ${preview.version} of ${item.id}`}
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
      </div>

      {needRights && (
        <form className="media-rights" onSubmit={(event) => void stateRights(event)} noValidate>
          <h3>State your rights</h3>
          <p className="media-meta">The team can only publish this photo once you have said who holds the rights to it.</p>
          <fieldset className="media-fieldset">
            <legend>{RIGHTS_STATEMENT.question}</legend>
            {RIGHTS_STATEMENT.options.map((option, index) => (
              <label className="check-label" key={option.id}>
                <input
                  id={index === 0 ? `${uid}-lrights-own` : undefined}
                  type="radio"
                  name={`${uid}-lrights`}
                  checked={formChoice === option.id}
                  disabled={stating}
                  onChange={() => {
                    setFormChoice(option.id);
                    setRightsErrors((old) => ({ ...old, rights: undefined }));
                  }}
                />
                <span>{option.label}</span>
              </label>
            ))}
            {rightsErrors.rights && <span className="field-error">{rightsErrors.rights}</span>}
          </fieldset>
          <label className="check-label">
            <input
              id={`${uid}-lconsent`}
              type="checkbox"
              checked={formConsent}
              disabled={stating}
              aria-describedby={rightsErrors.consent ? `${uid}-lconsent-error` : undefined}
              onChange={(event) => {
                setFormConsent(event.target.checked);
                setRightsErrors((old) => ({ ...old, consent: undefined }));
              }}
            />
            <span>{RIGHTS_STATEMENT.consent}</span>
          </label>
          {rightsErrors.consent && (
            <span className="field-error" id={`${uid}-lconsent-error`}>
              {rightsErrors.consent}
            </span>
          )}
          {rightsProblem && (
            <div className="media-alert" role="alert" tabIndex={-1} ref={rightsProblemRef}>
              {rightsProblem}
            </div>
          )}
          <div className="media-actions">
            <button className="btn" type="submit" disabled={stating}>
              {stating ? "Saving…" : "State my rights"}
            </button>
          </div>
        </form>
      )}

      <form className="media-licence" onSubmit={(event) => void save(event)} noValidate>
        <h3>Licence and credit</h3>
        {prefilled && (
          <p className="media-prompt">
            This is a new version. Your earlier licence details are filled in below but not saved yet. Check them, then
            save.
          </p>
        )}
        <div className="form-grid">
          {licenceFields.map((field) => {
            const needed = field === "licenceName" || (field === "credit" && base.creditRequired);
            const hintId = `${uid}-${field}-hint`;
            return (
              <div className={`field ${field === "attributionText" ? "full" : ""}`} key={field}>
                <label htmlFor={`${uid}-${field}`}>
                  {fieldLabels[field]}
                  {needed && <span className="media-needed"> · Needed before publishing</span>}
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
        <p className="media-meta">
          {base.creditRequired
            ? "A credit is required for this photo. The team sets this."
            : "A credit isn't required for this photo. The team sets this."}
        </p>
        {problem && (
          <div className="media-alert" role="alert" tabIndex={-1} ref={problemRef}>
            {problem}
          </div>
        )}
        <div className="media-actions">
          <button className="btn" type="submit" disabled={saving || stating}>
            {saving ? "Saving…" : "Save licence details"}
          </button>
        </div>
      </form>

      <div className="media-versions">
        <h3>Versions</h3>
        <ul>
          {versions.map((version) => (
            <li key={version.version}>
              <b>Version {version.version}</b>
              {version.version === item.draftVersion && " · latest draft"}
              {version.version === item.publishedVersion && " · live"} · {version.width}×{version.height} ·{" "}
              {fmtBytes(version.byteSize)} · <When value={version.createdAt} mounted={mounted} prefix="added " />
            </li>
          ))}
        </ul>
        {adding ? (
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
              onDone={() => void afterVersion()}
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
        <p className="eyebrow">COMMUNITY PHOTOGRAPHY</p>
        <h1>Bring your view of aviation.</h1>
        <p>
          Send photos of aircraft and airports to the Airplane Games team. Every photo is checked and reviewed before any
          use, and it is published only under the licence and credit you give for it. Nothing is played or sold here: the
          games live in the mobile app.
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
              <p className="media-meta">
                After the upload you add the licence details. Nothing goes live until the team has reviewed it.
              </p>
              <UploadForm
                ctx={ctx}
                idPrefix="media-new"
                target="create"
                path="/api/media"
                submitLabel="Upload photo"
                onDone={(item) => {
                  patchItem(item);
                  ctx.say("Photo received and checked. Add its licence details next.");
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
                          {item.id}
                          <span className="visually-hidden">, open details</span>
                        </button>
                        <span className="media-state">{stateText[item.state]}</span>
                        {hasChangesWaiting(item) && <span className="media-badge">Changes waiting</span>}
                      </div>
                      <p className="media-meta">
                        {fileSummary(item)} · {licenceStatus(item.draft.licence)}
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
