"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowClockwise,
  ArrowLeft,
  CheckCircle,
  CloudArrowUp,
  FileImage,
  ImageSquare,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  X,
} from "@phosphor-icons/react";
import { SiteLink as Link } from "@/components/SiteLink";
import { useAccountSession } from "@/components/AccountSession";
import { AccountActions } from "@/components/AccessGate";
import {
  accountHeaders,
  accountSignInPath,
  contributorPath,
} from "@/lib/account";
import {
  categoryNames,
  channelNames,
  MAX_UPLOAD_BYTES,
  submissionSchema,
} from "@/lib/rules";
import { games } from "@/lib/catalog";
import type {
  Category,
  Channel,
  Submission,
  SubmissionData,
} from "@/lib/types";
import "./contribute.css";
import { sitePath } from "@/lib/paths";

type Contributor = {
  displayName: string;
  email: string;
  sessionKey: string;
} | null;
type Props = {
  user: Contributor;
  initialCategory?: string;
  initialGame?: string;
  initialView?: "new" | "mine";
  demoMode?: boolean;
};
type FieldErrors = Record<string, string>;
type ApiResponse = {
  error?: string;
  code?: string;
  submissions?: Submission[];
  submission?: Submission;
  fields?: Record<string, unknown>;
};

const gameCategory: Record<string, Category> = {
  "aircraft-identifier": "aircraft",
  "tail-identifier": "tail",
  "airport-spotter": "airport",
  "atc-match": "atc",
  "call-sign-match": "atc",
  "code-search": "atc",
  "runway-identifier": "runway",
};
const emptyData = (
  user: Contributor,
  category?: string,
  game?: string,
): SubmissionData => ({
  title: "",
  photographer: user?.displayName ?? "",
  email: user?.email ?? "",
  portfolio: "",
  category: (["aircraft", "tail", "airport", "atc", "runway", "other"].includes(
    category ?? "",
  )
    ? category
    : (gameCategory[game ?? ""] ?? "aircraft")) as Category,
  customCategory: "",
  targetGames: games.some((entry) => entry.slug === game) ? [game!] : [],
  aircraft: "",
  airline: "",
  registration: "",
  location: "",
  airportCode: "",
  capturedOn: "",
  description: "",
  factualSource: "",
  credit: "",
  rightsBasis: "owner",
  rightsEvidence: "",
  channels: [],
  imageOrigin: "camera",
  consent: false,
});

const categoryEntries = Object.entries(categoryNames) as [Category, string][];
const channelEntries = Object.entries(channelNames) as [Channel, string][];
const idSafe = (key: string) => `field-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

export default function SubmissionForm({
  user,
  initialCategory,
  initialGame,
  initialView = "new",
  demoMode = false,
}: Props) {
  const accountSession = useAccountSession();
  const accountRef = useRef(accountSession);
  accountRef.current = accountSession;
  const [blockedAccess, setBlockedAccess] = useState<number | null>(null);
  const blockedAccessRef = useRef<number | null>(null);
  const generation = useRef(0);
  const loadedListSessionKey = useRef<string | null>(null);
  const [tab, setTab] = useState<"new" | "mine">(initialView);
  const [data, setData] = useState<SubmissionData>(() =>
    emptyData(user, initialCategory, initialGame),
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [existingPhoto, setExistingPhoto] = useState<string | null>(null);
  const [revision, setRevision] = useState<Submission | null>(null);
  const [items, setItems] = useState<Submission[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [retryKey, setRetryKey] = useState(() => crypto.randomUUID());
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const sessionMatches =
    !!user &&
    accountSession.state === "ready" &&
    !!accountSession.account?.user &&
    accountSession.account.sessionKey === user.sessionKey &&
    blockedAccess === null;
  const canShowContentDuringRevalidation =
    !!user &&
    accountSession.state === "loading" &&
    accountSession.sameUserRevalidating &&
    accountSession.account?.sessionKey === user.sessionKey &&
    (tab !== "mine" || loadedListSessionKey.current === user.sessionKey) &&
    blockedAccess === null;
  const sessionMatchesRef = useRef(sessionMatches);
  sessionMatchesRef.current = sessionMatches;

  useEffect(() => setTab(initialView), [initialView]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const sessionKey = user?.sessionKey ?? null;
  const refresh = useCallback(async () => {
    if (!sessionKey) return;
    if (
      accountRef.current.state !== "ready" ||
      !accountRef.current.account?.user ||
      accountRef.current.account.sessionKey !== sessionKey ||
      blockedAccessRef.current !== null ||
      !sessionMatchesRef.current
    )
      return;
    const requestGeneration = ++generation.current;
    setLoadingList(true);
    try {
      const response = await fetch(sitePath("/api/submissions"), {
        cache: "no-store",
        headers: accountHeaders(sessionKey),
      });
      const body = (await response.json()) as ApiResponse;
      if (
        requestGeneration !== generation.current ||
        accountRef.current.account?.sessionKey !== sessionKey ||
        !sessionMatchesRef.current
      )
        return;
      if (!response.ok) {
        if (
          response.status === 401 ||
          response.status === 403 ||
          body.code === "ACCOUNT_CHANGED"
        ) {
          const status = response.status || 409;
          generation.current += 1;
          loadedListSessionKey.current = null;
          setItems([]);
          setRevision(null);
          setExistingPhoto(null);
          blockedAccessRef.current = status;
          setBlockedAccess(status);
          accountRef.current.reportAccess(status);
          return;
        }
        throw new Error(body.error || "Could not load your proposals.");
      }
      loadedListSessionKey.current = sessionKey;
      setItems(Array.isArray(body.submissions) ? body.submissions : []);
    } catch (error) {
      if (requestGeneration !== generation.current) return;
      setProblem(
        error instanceof Error
          ? error.message
          : "Could not load your proposals.",
      );
    } finally {
      if (requestGeneration === generation.current) setLoadingList(false);
    }
  }, [sessionKey]);

  useEffect(() => {
    if (!user) return;
    if (sessionMatches) {
      if (loadedListSessionKey.current !== user.sessionKey) void refresh();
    } else {
      generation.current += 1;
      setLoadingList(false);
      if (accountSession.state !== "ready" && blockedAccessRef.current === null)
        return;
      loadedListSessionKey.current = null;
      setItems([]);
      if (revision) {
        setData(emptyData(user, initialCategory, initialGame));
        setFile(null);
        setPreview(null);
      }
      setRevision(null);
      setExistingPhoto(null);
      setLoadingList(false);
    }
  }, [
    sessionMatches,
    accountSession.state,
    accountSession.sameUserRevalidating,
    user,
    refresh,
    revision,
    initialCategory,
    initialGame,
  ]);

  const set = <K extends keyof SubmissionData>(
    key: K,
    value: SubmissionData[K],
  ) => setData((current) => ({ ...current, [key]: value }));
  const toggleValue = <T extends string>(
    values: T[],
    value: T,
    checked: boolean,
  ) => (checked ? [...values, value] : values.filter((item) => item !== value));
  const acceptFile = (selected?: File) => {
    if (!selected) return;
    setProblem("");
    setNotice("");
    if (
      !/[.]jpe?g$/i.test(selected.name) &&
      !/[.]png$/i.test(selected.name) &&
      !["image/jpeg", "image/png"].includes(selected.type)
    ) {
      setErrors((old) => ({
        ...old,
        photo: "Choose a JPEG or PNG photograph.",
      }));
      return;
    }
    if (selected.size > MAX_UPLOAD_BYTES) {
      setErrors((old) => ({
        ...old,
        photo: "Keep the photograph under 12 MB.",
      }));
      return;
    }
    setErrors((old) => {
      const next = { ...old };
      delete next.photo;
      return next;
    });
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };
  const resetForm = () => {
    setData(emptyData(user, initialCategory, initialGame));
    setFile(null);
    setPreview(null);
    setExistingPhoto(null);
    setRevision(null);
    setErrors({});
    setProblem("");
    setNotice("");
    setRetryKey(crypto.randomUUID());
    if (fileRef.current) fileRef.current.value = "";
  };
  const beginRevision = (item: Submission) => {
    setData({
      ...item.data,
      targetGames: [...item.data.targetGames],
      channels: [...item.data.channels],
    });
    setFile(null);
    setPreview(null);
    setExistingPhoto(item.photoUrl);
    setRevision(item);
    setErrors({});
    setProblem("");
    setNotice("");
    setTab("new");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const normalized = useMemo(
    () => ({
      ...data,
      targetGames: [...data.targetGames],
      channels: [...data.channels],
    }),
    [data],
  );

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("");
    setProblem("");
    if (!user) {
      setProblem(
        "Sign in with your email or Google account to send a proposal.",
      );
      return;
    }
    if (!sessionMatches) {
      setProblem(
        "Your account session needs attention before this proposal can be sent.",
      );
      return;
    }
    const parsed = submissionSchema.safeParse(normalized);
    const nextErrors: FieldErrors = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
    if (!file && !existingPhoto)
      nextErrors.photo = "Choose a JPEG or PNG photograph.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      const first = Object.keys(nextErrors)[0];
      requestAnimationFrame(() =>
        document.getElementById(idSafe(first))?.focus(),
      );
      setProblem("Please check the fields marked below.");
      return;
    }
    setErrors({});
    setBusy(true);
    const requestGeneration = generation.current;
    try {
      const payload = new FormData();
      payload.set("data", JSON.stringify(parsed.data));
      if (file) payload.set("photo", file);
      if (revision) payload.set("version", String(revision.version));
      const response = await fetch(
        sitePath(
          revision
            ? `/api/submissions/${encodeURIComponent(revision.id)}`
            : "/api/submissions",
        ),
        {
          method: revision ? "PUT" : "POST",
          headers: {
            "Idempotency-Key": retryKey,
            ...accountHeaders(user.sessionKey),
          },
          body: payload,
        },
      );
      const body = (await response.json()) as ApiResponse;
      if (
        requestGeneration !== generation.current ||
        accountRef.current.account?.sessionKey !== user.sessionKey ||
        !sessionMatchesRef.current
      )
        return;
      if (!response.ok) {
        if (
          response.status === 401 ||
          response.status === 403 ||
          body.code === "ACCOUNT_CHANGED"
        ) {
          const status = response.status || 409;
          generation.current += 1;
          setItems([]);
          setRevision(null);
          setExistingPhoto(null);
          blockedAccessRef.current = status;
          setBlockedAccess(status);
          accountRef.current.reportAccess(status);
          return;
        }
        if (body.fields) {
          const fromServer: FieldErrors = {};
          for (const [key, messages] of Object.entries(
            body.fields as Record<string, unknown>,
          ))
            if (Array.isArray(messages) && messages[0])
              fromServer[key] = String(messages[0]);
          setErrors(fromServer);
          const first = Object.keys(fromServer)[0];
          if (first)
            requestAnimationFrame(() =>
              document.getElementById(idSafe(first))?.focus(),
            );
        }
        if (
          response.status === 409 &&
          body.error?.includes("retry key belongs to a different proposal")
        ) {
          setProblem(
            "This retry key is attached to a proposal with different details. Check My submissions before starting another proposal.",
          );
          setTab("mine");
          await refresh();
          return;
        }
        throw new Error(
          body.error ||
            "Your proposal could not be sent. Your details are still here; try again.",
        );
      }
      setNotice(
        revision
          ? "Your revised proposal is back in the review queue."
          : "Your proposal has been sent for private review.",
      );
      resetForm();
      setTab("mine");
      await refresh();
    } catch (error) {
      if (requestGeneration !== generation.current) return;
      setProblem(
        error instanceof Error
          ? error.message
          : "Your proposal could not be sent. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (key: string) =>
    errors[key] ? (
      <span className="field-error" id={`${idSafe(key)}-error`}>
        {errors[key]}
      </span>
    ) : null;
  const describedBy = (key: string, hint?: string) =>
    [
      hint ? `${uid}-${key}-hint` : "",
      errors[key] ? `${idSafe(key)}-error` : "",
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  const controlProps = (key: string, hint?: string) => ({
    id: idSafe(key),
    "aria-invalid": !!errors[key],
    "aria-describedby": describedBy(key, hint),
  });

  return (
    <main className="wrap contribute-root">
      <section className="page-intro">
        <p className="eyebrow">COMMUNITY PHOTOGRAPHY</p>
        <h1>Bring your view of aviation.</h1>
        <p>
          Propose a photograph for editorial review. Tell us what it shows and
          where you think it could fit.
        </p>
      </section>
      {user && !sessionMatches && !canShowContentDuringRevalidation ? (
        <section
          className="signin-panel account-session-gate"
          role={
            accountSession.state === "error" || blockedAccess === 403
              ? "alert"
              : undefined
          }
        >
          <ImageSquare size={28} weight="duotone" aria-hidden="true" />
          <h2>
            {accountSession.state === "error"
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
            {accountSession.state === "error"
              ? "We could not confirm your account. Retry the check before opening private submissions."
              : blockedAccess === 403
                ? "This account can no longer access these private submissions."
                : accountSession.state === "loading"
                  ? "Confirming your account before loading private proposals."
                  : "Private proposal lists and revision details were cleared. Unsent form values remain only in this page; navigating away or reloading will lose them."}
          </p>
          <AccountActions
            className="actions account-session-actions"
            onRetry={
              accountSession.state === "error"
                ? () => void accountSession.refresh()
                : undefined
            }
            signInHref={
              !accountSession.account?.user ||
              blockedAccess === 401 ||
              (accountSession.account?.sessionKey &&
                accountSession.account.sessionKey !== user.sessionKey)
                ? accountSignInPath(
                    contributorPath(
                      initialCategory,
                      initialGame,
                      tab === "mine" ? "mine" : undefined,
                    ),
                  )
                : null
            }
            reloadLabel="Reload page"
          />
        </section>
      ) : !user ? (
        <section className="signin-panel" aria-labelledby="signin-heading">
          <ImageSquare size={28} weight="duotone" aria-hidden="true" />
          <h2 id="signin-heading">Sign in to contribute</h2>
          <p>
            Your proposal and review notes are private to your account and our
            editorial team.
          </p>
          <Link
            className="btn"
            href={accountSignInPath(
              contributorPath(
                initialCategory,
                initialGame,
                initialView === "mine" ? "mine" : undefined,
              ),
            )}
            target="_top"
          >
            Sign in <ArrowLeft size={16} aria-hidden="true" />
          </Link>
        </section>
      ) : (
        <>
          <nav className="actions" aria-label="Contributor pages">
            <button
              className={`btn ${tab === "new" ? "" : "secondary"}`}
              type="button"
              onClick={() => {
                setTab("new");
                setProblem("");
              }}
            >
              {" "}
              <Plus size={18} aria-hidden="true" /> New proposal
            </button>
            <button
              className={`btn ${tab === "mine" ? "" : "secondary"}`}
              type="button"
              onClick={() => {
                setTab("mine");
                setNotice("");
              }}
            >
              My submissions{" "}
              <span aria-label={`${items.length} submissions`}>
                {items.length}
              </span>
            </button>
          </nav>
          {problem && (
            <div className="error" role="alert" ref={errorRef}>
              {problem}
            </div>
          )}
          {notice && (
            <div className="success" role="status">
              <CheckCircle size={20} aria-hidden="true" />
              {notice}
              <button
                type="button"
                aria-label="Dismiss notice"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {tab === "mine" ? (
            <section aria-labelledby="mine-title">
              <div className="actions">
                <div>
                  <p className="eyebrow">YOUR ACCOUNT</p>
                  <h2 id="mine-title">My submissions</h2>
                </div>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => void refresh()}
                  disabled={loadingList || accountSession.state !== "ready"}
                >
                  <ArrowClockwise size={17} aria-hidden="true" /> Refresh
                </button>
              </div>
              {loadingList && !items.length ? (
                <p role="status">Loading your proposals…</p>
              ) : items.length ? (
                <>
                  {loadingList && (
                    <p role="status">Refreshing your proposals…</p>
                  )}
                  <div className="submission-list">
                    {items.map((item) => (
                      <article className="submission-item" key={item.id}>
                        {item.photoUrl && (
                          <img src={sitePath(item.photoUrl)} alt="" loading="lazy" />
                        )}
                        <div className="submission-item__body">
                          <div className="actions">
                            <h3>{item.data.title}</h3>
                            <span className={`status status--${item.status}`}>
                              {item.status.replaceAll("_", " ")}
                            </span>
                          </div>
                          <p>
                            {categoryNames[item.data.category]} · Updated{" "}
                            {new Date(item.updatedAt).toLocaleDateString()}
                          </p>
                          {item.reviewNote && (
                            <div className="notice">
                              <strong>Editorial review note</strong>
                              <p>{item.reviewNote}</p>
                            </div>
                          )}
                          {(["pending", "changes_requested"] as const).includes(
                            item.status as "pending" | "changes_requested",
                          ) && (
                            <button
                              className="btn secondary"
                              type="button"
                              onClick={() => beginRevision(item)}
                            >
                              <PencilSimple size={17} aria-hidden="true" /> Revise
                              proposal
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <div className="notice">
                  <p>You haven’t sent a proposal yet.</p>
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => setTab("new")}
                  >
                    Start a proposal <ArrowLeft size={15} aria-hidden="true" />
                  </button>
                </div>
              )}
            </section>
          ) : (
            <div className="contribute-layout">
              <form ref={formRef} onSubmit={submit} noValidate>
                {revision && (
                  <div className="notice actions">
                    <div>
                      <strong>Revising: {revision.data.title}</strong>
                      <p>
                        Saving sends this proposal back to the review queue.
                      </p>
                    </div>
                    <button
                      className="text-link"
                      type="button"
                      onClick={resetForm}
                    >
                      Start a new proposal
                    </button>
                  </div>
                )}
                <section className="form-section">
                  <div className="section-heading">
                    <div>
                      <h2>Photograph</h2>
                      <p>
                        Choose a clear original photograph. JPEG and PNG files
                        up to 12 MB.
                      </p>
                    </div>
                  </div>
                  <div className="form-grid">
                    <div className="field full">
                      <label htmlFor={idSafe("photo")}>
                        Photo file{" "}
                        {!revision && <span aria-hidden="true">*</span>}
                      </label>
                      <input
                        ref={fileRef}
                        id={idSafe("photo")}
                        type="file"
                        accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                        className="visually-hidden"
                        aria-describedby={describedBy("photo", "photo-hint")}
                        aria-invalid={!!errors.photo}
                        onChange={(e) => acceptFile(e.currentTarget.files?.[0])}
                      />
                      {preview || existingPhoto ? (
                        <div className="upload-preview">
                          <img
                            src={preview ?? sitePath(existingPhoto!)}
                            alt="Preview of your proposed photograph"
                          />
                          <div>
                            <strong>
                              {file?.name ?? "Current proposal image"}
                            </strong>
                            <p>
                              {file
                                ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                                : "A replacement is optional."}
                            </p>
                            <div className="actions">
                              <button
                                className="btn secondary"
                                type="button"
                                onClick={() => fileRef.current?.click()}
                              >
                                <FileImage size={17} aria-hidden="true" />{" "}
                                {file ? "Choose another" : "Replace photo"}
                              </button>
                              {file && (
                                <button
                                  type="button"
                                  className="text-link"
                                  onClick={() => {
                                    setFile(null);
                                    setPreview(null);
                                    if (fileRef.current)
                                      fileRef.current.value = "";
                                  }}
                                >
                                  Remove replacement
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="drop-zone"
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            acceptFile(e.dataTransfer.files[0]);
                          }}
                        >
                          <CloudArrowUp
                            size={30}
                            weight="duotone"
                            aria-hidden="true"
                          />
                          <strong>Choose a photograph</strong>
                          <span>or drag and drop it here</span>
                          <small>JPEG or PNG · up to 12 MB</small>
                        </button>
                      )}
                      <span className="hint" id={`${uid}-photo-hint`}>
                        The image must be at least 600 pixels on each side.
                        Files are checked again on upload.
                      </span>
                      {fieldError("photo")}
                    </div>
                    <div className="field">
                      <label htmlFor={idSafe("title")}>
                        Photo title <span aria-hidden="true">*</span>
                      </label>
                      <input
                        {...controlProps("title")}
                        value={data.title}
                        onChange={(e) => set("title", e.target.value)}
                        maxLength={160}
                        placeholder="A title that describes the moment"
                      />
                      {fieldError("title")}
                    </div>
                    <div className="field">
                      <label htmlFor={idSafe("category")}>
                        Category <span aria-hidden="true">*</span>
                      </label>
                      <select
                        {...controlProps("category")}
                        value={data.category}
                        onChange={(e) =>
                          set("category", e.target.value as Category)
                        }
                      >
                        {categoryEntries.map(([key, label]) => (
                          <option value={key} key={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                      {fieldError("category")}
                    </div>
                    {data.category === "other" && (
                      <div className="field">
                        <label htmlFor={idSafe("customCategory")}>
                          Name the category <span aria-hidden="true">*</span>
                        </label>
                        <input
                          {...controlProps("customCategory")}
                          value={data.customCategory}
                          onChange={(e) =>
                            set("customCategory", e.target.value)
                          }
                          maxLength={160}
                        />
                        {fieldError("customCategory")}
                      </div>
                    )}
                    <div className="field full">
                      <label htmlFor={idSafe("description")}>
                        Photo context <span aria-hidden="true">*</span>
                      </label>
                      <textarea
                        {...controlProps("description", "description-hint")}
                        value={data.description}
                        onChange={(e) => set("description", e.target.value)}
                        rows={4}
                        maxLength={2400}
                        placeholder="What is happening in the photograph? Add useful context or details for an editor."
                      />
                      <span className="hint" id={`${uid}-description-hint`}>
                        At least 15 characters. Stick to details you know or can
                        source. {data.description.length}/2400
                      </span>
                      {fieldError("description")}
                    </div>
                    <div className="field">
                      <label htmlFor={idSafe("imageOrigin")}>
                        Photo origin <span aria-hidden="true">*</span>
                      </label>
                      <select
                        {...controlProps("imageOrigin")}
                        value={data.imageOrigin}
                        onChange={(e) =>
                          set(
                            "imageOrigin",
                            e.target.value as SubmissionData["imageOrigin"],
                          )
                        }
                      >
                        <option value="camera">
                          Photographed with a camera
                        </option>
                        <option value="edited">Photograph with edits</option>
                        <option value="generated">
                          AI-generated or synthetic image
                        </option>
                      </select>
                      {fieldError("imageOrigin")}
                    </div>
                  </div>
                </section>
                <section className="form-section">
                  <div className="section-heading">
                    <div>
                      <h2>What’s in the frame?</h2>
                      <p>
                        Share identification details that can help with review.
                      </p>
                    </div>
                  </div>
                  <div className="form-grid">
                    {[
                      [
                        "aircraft",
                        "Aircraft make and model",
                        "e.g. Boeing 737-800",
                      ],
                      ["airline", "Airline", "e.g. KLM"],
                      ["registration", "Registration", "e.g. PH-BXM"],
                      [
                        "location",
                        "Photo location",
                        "City, airfield, or viewing spot",
                      ],
                      ["airportCode", "Airport code", "IATA or ICAO"],
                      ["capturedOn", "Capture date", ""],
                    ].map(([key, label, placeholder]) => (
                      <div className="field" key={key}>
                        <label htmlFor={idSafe(key)}>
                          {label}
                          {key === "location" ? (
                            <span aria-hidden="true"> *</span>
                          ) : null}
                        </label>
                        <input
                          {...controlProps(key)}
                          type={key === "capturedOn" ? "date" : "text"}
                          value={data[key as keyof SubmissionData] as string}
                          onChange={(e) =>
                            set(
                              key as keyof SubmissionData,
                              e.target.value as never,
                            )
                          }
                          maxLength={key === "registration" ? 40 : undefined}
                          placeholder={placeholder}
                        />
                        {fieldError(key)}
                      </div>
                    ))}
                    <div className="field full">
                      <label htmlFor={idSafe("factualSource")}>
                        Factual source
                      </label>
                      <input
                        {...controlProps("factualSource", "source-hint")}
                        type="url"
                        value={data.factualSource}
                        onChange={(e) => set("factualSource", e.target.value)}
                        maxLength={600}
                        placeholder="https://…"
                      />
                      <span className="hint" id={`${uid}-source-hint`}>
                        A reliable source for aircraft, airport, or historical
                        details. Use a full https:// link.
                      </span>
                      {fieldError("factualSource")}
                    </div>
                  </div>
                </section>
                <section className="form-section">
                  <div className="section-heading">
                    <div>
                      <h2>Photographer & credit</h2>
                      <p>
                        Tell us how to contact you and how you’d like the image
                        credited.
                      </p>
                    </div>
                  </div>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor={idSafe("photographer")}>
                        Photographer name <span aria-hidden="true">*</span>
                      </label>
                      <input
                        {...controlProps("photographer")}
                        value={data.photographer}
                        onChange={(e) => set("photographer", e.target.value)}
                        maxLength={160}
                      />
                      {fieldError("photographer")}
                    </div>
                    <div className="field">
                      <label htmlFor={idSafe("email")}>
                        Contact email <span aria-hidden="true">*</span>
                      </label>
                      <input
                        {...controlProps("email")}
                        type="email"
                        autoComplete="email"
                        value={data.email}
                        onChange={(e) => set("email", e.target.value)}
                        maxLength={254}
                      />
                      {fieldError("email")}
                    </div>
                    <div className="field">
                      <label htmlFor={idSafe("credit")}>
                        Requested photo credit <span aria-hidden="true">*</span>
                      </label>
                      <input
                        {...controlProps("credit")}
                        value={data.credit}
                        onChange={(e) => set("credit", e.target.value)}
                        maxLength={160}
                        placeholder="e.g. Name / website or social handle"
                      />
                      {fieldError("credit")}
                    </div>
                    <div className="field">
                      <label htmlFor={idSafe("portfolio")}>
                        Portfolio link
                      </label>
                      <input
                        {...controlProps("portfolio")}
                        type="url"
                        value={data.portfolio}
                        onChange={(e) => set("portfolio", e.target.value)}
                        maxLength={600}
                        placeholder="https://…"
                      />
                      {fieldError("portfolio")}
                    </div>
                  </div>
                </section>
                <section className="form-section">
                  <div className="section-heading">
                    <div>
                      <h2>Rights & proposed use</h2>
                      <p>This submission is for private review only.</p>
                    </div>
                  </div>
                  <fieldset
                    className="field full"
                    aria-describedby={
                      errors.rightsBasis
                        ? `${idSafe("rightsBasis")}-error`
                        : undefined
                    }
                  >
                    <legend>
                      What is your relationship to the photograph?{" "}
                      <span aria-hidden="true">*</span>
                    </legend>
                    <div className="check-list">
                      <label className="check-label">
                        <input
                          id={idSafe("rightsBasis")}
                          type="radio"
                          name="rights"
                          checked={data.rightsBasis === "owner"}
                          onChange={() => set("rightsBasis", "owner")}
                        />{" "}
                        I took the photograph and hold the rights
                      </label>
                      <label className="check-label">
                        <input
                          type="radio"
                          name="rights"
                          checked={data.rightsBasis === "authorized"}
                          onChange={() => set("rightsBasis", "authorized")}
                        />{" "}
                        I’m authorized by the rights holder to submit it for
                        review
                      </label>
                    </div>
                    {fieldError("rightsBasis")}
                  </fieldset>
                  <div className="field full">
                    <label htmlFor={idSafe("rightsEvidence")}>
                      Rights or permission details
                    </label>
                    <textarea
                      {...controlProps("rightsEvidence", "rights-hint")}
                      value={data.rightsEvidence}
                      onChange={(e) => set("rightsEvidence", e.target.value)}
                      rows={3}
                      maxLength={2400}
                      placeholder="For example, note that you created the photo, or describe the permission you have."
                    />
                    <span className="hint" id={`${uid}-rights-hint`}>
                      You can include the rights holder or permission details.
                      This is for editorial review.
                    </span>
                    {fieldError("rightsEvidence")}
                  </div>
                  <fieldset
                    className="field full"
                    aria-describedby={
                      errors.channels
                        ? `${idSafe("channels")}-error`
                        : undefined
                    }
                  >
                    <legend>
                      Where could this photo fit? Select one or more{" "}
                      <span aria-hidden="true">*</span>
                    </legend>
                    <div className="check-list">
                      {channelEntries.map(([key, label], index) => (
                        <label className="check-label" key={key}>
                          <input
                            id={index === 0 ? idSafe("channels") : undefined}
                            type="checkbox"
                            checked={data.channels.includes(key)}
                            onChange={(e) =>
                              set(
                                "channels",
                                toggleValue(
                                  data.channels,
                                  key,
                                  e.target.checked,
                                ),
                              )
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    {fieldError("channels")}
                  </fieldset>
                  <fieldset
                    className="field full"
                    aria-describedby={
                      errors.targetGames
                        ? `${idSafe("targetGames")}-error`
                        : undefined
                    }
                  >
                    <legend>Games this photograph could support</legend>
                    <div className="check-list check-list--games">
                      {games.map((game, index) => (
                        <label className="check-label" key={game.slug}>
                          <input
                            id={index === 0 ? idSafe("targetGames") : undefined}
                            type="checkbox"
                            checked={data.targetGames.includes(game.slug)}
                            onChange={(e) =>
                              set(
                                "targetGames",
                                toggleValue(
                                  data.targetGames,
                                  game.slug,
                                  e.target.checked,
                                ),
                              )
                            }
                          />
                          <span>
                            <strong>{game.name}</strong>
                            <small>{game.subtitle}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                    {fieldError("targetGames")}
                  </fieldset>
                  <label className="check-label consent">
                    <input
                      {...controlProps("consent")}
                      type="checkbox"
                      checked={data.consent}
                      onChange={(e) => set("consent", e.target.checked)}
                    />
                    <span>
                      I confirm I have permission to submit this photograph for
                      private editorial review. I understand that this does not
                      grant a license to publish or use it publicly; copyright
                      remains with the rights holder. Any later use would need
                      separate permission. <span aria-hidden="true">*</span>
                      {fieldError("consent")}
                    </span>
                  </label>
                </section>
                <div className="actions submit-actions">
                  <button
                    type="submit"
                    className="btn"
                    disabled={busy || !sessionMatches}
                  >
                    <PaperPlaneTilt size={18} aria-hidden="true" />
                    {busy
                      ? "Sending proposal…"
                      : revision
                        ? "Send revision for review"
                        : "Send for private review"}
                  </button>
                  <span>
                    Private review only · copyright stays with the rights holder
                  </span>
                </div>
              </form>
              <aside className="contribute-aside">
                <figure>
                  <img
                    src={sitePath("/media/potd-5.jpg")}
                    alt="Qantas Airbus A380 on approach"
                  />
                  <figcaption>
                    Photo:{" "}
                    <a
                      href="https://www.instagram.com/iamjoshmark/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Josh M (@iamjoshmark)
                    </a>
                  </figcaption>
                </figure>
                <p className="eyebrow">A GOOD PROPOSAL</p>
                <h2>Give the image its context.</h2>
                <p>
                  A useful submission pairs a sharp, original photograph with
                  clear details: what’s shown, where it was taken, and a source
                  editors can check.
                </p>
                <div className="notice">
                  <strong>How review works</strong>
                  <ol className="review-steps">
                    <li>
                      We review image quality, identification, credit, and
                      rights evidence.
                    </li>
                    <li>
                      If we need anything else, we’ll add a private note to your
                      proposal.
                    </li>
                    <li>
                      Approval for review does not itself authorize public use.
                    </li>
                  </ol>
                </div>
                <Link className="text-link" href="/about">
                  Read about the project{" "}
                  <ArrowLeft size={15} aria-hidden="true" />
                </Link>
              </aside>
            </div>
          )}
        </>
      )}
    </main>
  );
}
