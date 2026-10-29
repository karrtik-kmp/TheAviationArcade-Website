"use client";

import {
  Button,
  Checkbox,
  FluentProvider,
  Input,
  MessageBar,
  MessageBarBody,
  Textarea,
  webDarkTheme,
  webLightTheme,
} from "@fluentui/react-components";
import {
  AirplaneInFlight,
  AirplaneTilt,
  ArrowClockwise,
  ArrowLeft,
  CheckCircle,
  ClipboardText,
  ClockCounterClockwise,
  ImageSquare,
  Newspaper,
  ShieldCheck,
  SquaresFour,
} from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AccountControl } from "@/components/AccountControl";
import { useAccountSession } from "@/components/AccountSession";
import { Brand, ThemeToggle } from "@/components/PublicShell";
import { AccountActions } from "@/components/AccessGate";
import { MilitaryWorkspace } from "@/components/MilitaryWorkspace";
import "@/components/admin.css";
import {
  accountHeaders,
  accountSignInPath,
} from "@/lib/account";
import type {
  EditorialData,
  EditorialRecord,
  ReviewChecks,
  Submission,
  SubmissionStatus,
} from "@/lib/types";
import {
  categoryNames,
  channelNames,
  editorialErrors,
  reviewError,
} from "@/lib/rules";
import { sampleEditorialRecords } from "@/lib/demo-samples";
import type {
  MilitaryAircraft,
  MilitaryPackage,
  MilitaryPackageData,
  MilitaryRelease,
  MilitaryStage,
  ReleasePointer,
} from "@/lib/military";
import { sitePath } from "@/lib/paths";
import { createDraftSession, type Outcome } from "@/lib/editorial/draft-session";

type AdminUser = { sessionKey: string };
type Section =
  | "Overview"
  | "Submissions"
  | "Aircraft Identifier"
  | "Plane of the Day"
  | "Military readiness"
  | "Activity";
type AuditEvent = {
  entity_id: string;
  action: string;
  detail: string;
  created_at: string;
};
type LoadState = "loading" | "ready" | "error";
type Notice = { kind: "error" | "success"; text: string } | null;

const navItems: { label: Section; icon: typeof SquaresFour }[] = [
  { label: "Overview", icon: SquaresFour },
  { label: "Submissions", icon: ClipboardText },
  { label: "Aircraft Identifier", icon: AirplaneInFlight },
  { label: "Plane of the Day", icon: ImageSquare },
  { label: "Military readiness", icon: AirplaneTilt },
  { label: "Activity", icon: ClockCounterClockwise },
];
const checkNames: { key: keyof ReviewChecks; label: string }[] = [
  { key: "identity", label: "Aircraft identity is supported" },
  { key: "quality", label: "Photo quality is suitable" },
  { key: "credit", label: "Photographer credit is correct" },
  { key: "rights", label: "Usage rights are documented" },
  { key: "category", label: "Submission category is accurate" },
];
const ranks = [
  "Trainee",
  "First Officer",
  "Captain",
  "Check Airman",
  "Chief Pilot",
];

function prettyDate(value: string) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: value.includes("T") ? "short" : undefined,
      }).format(date);
}
function emptyChecks(): ReviewChecks {
  return {
    identity: false,
    quality: false,
    credit: false,
    rights: false,
    category: false,
  };
}
const emptyPointer = { current: null, history: [], version: 0 };

function responseError(body: unknown, fallback: string) {
  return body &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
    ? body.error
    : fallback;
}
function responseCode(body: unknown) {
  return body &&
    typeof body === "object" &&
    "code" in body &&
    typeof body.code === "string"
    ? body.code
    : "";
}
function seedData(record: EditorialRecord): EditorialData {
  return { ...record.data, distractors: [...record.data.distractors] };
}
function displayStatus(status: string) {
  return status.replaceAll("_", " ");
}

/** readOnly is the shared demo account's view of the sample drafts; it never calls admin APIs. */
export function AdminApp({
  user,
  readOnly = false,
}: {
  user: AdminUser;
  readOnly?: boolean;
}) {
  const accountSession = useAccountSession();
  const accountRef = useRef(accountSession);
  accountRef.current = accountSession;
  const [blockedAccess, setBlockedAccess] = useState<number | null>(null);
  const blockedAccessRef = useRef<number | null>(null);
  const userRef = useRef(user);
  userRef.current = user;
  // Base versions, the generation guard and refusal handling; see lib/editorial/draft-session.ts.
  const [drafts] = useState(() =>
    createDraftSession({
      isActive: () => currentAccessRef.current,
      async send(method, url, payload) {
        try {
          const response = await fetch(sitePath(url), {
            method,
            headers: {
              "Content-Type": "application/json",
              ...accountHeaders(userRef.current.sessionKey),
            },
            body: JSON.stringify(payload),
          });
          return {
            ok: response.ok,
            status: response.status,
            body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
          };
        } catch (error) {
          return {
            ok: false,
            status: 0,
            body: {
              error: error instanceof Error ? error.message : "The request could not be saved.",
            },
          };
        }
      },
    }),
  );
  const currentAccountMatches =
    accountSession.state === "ready" &&
    !!accountSession.account?.user &&
    (readOnly || accountSession.account.isStaff) &&
    accountSession.account.sessionKey === user.sessionKey &&
    blockedAccess === null;
  const { resolvedTheme } = useTheme();
  const fluentTheme = resolvedTheme === "dark" ? webDarkTheme : webLightTheme;
  const brandBackground = resolvedTheme === "dark" ? "#c64731" : "#a93825";
  const [section, setSection] = useState<Section>("Overview");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [records, setRecords] = useState<EditorialRecord[]>([]);
  const [packages, setPackages] = useState<MilitaryPackage[]>([]);
  const [releases, setReleases] = useState<MilitaryRelease[]>([]);
  const [pointer, setPointer] = useState<ReleasePointer & { version: number }>(
    emptyPointer,
  );
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [checks, setChecks] = useState<ReviewChecks>(emptyChecks());
  const [reviewNote, setReviewNote] = useState("");
  const [recordId, setRecordId] = useState("");
  const [recordData, setRecordData] = useState<EditorialData | null>(null);
  const [dateKey, setDateKey] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const clearPrivateData = useCallback(() => {
    drafts.reset();
    setSubmissions([]);
    setRecords([]);
    setPackages([]);
    setReleases([]);
    setPointer(emptyPointer);
    setEvents([]);
    setSelectedId("");
    setRecordId("");
    setRecordData(null);
    setChecks(emptyChecks());
    setReviewNote("");
    setLoadError("");
    setLoadState("loading");
    setBusy(false);
  }, [drafts]);

  const blockAccess = useCallback(
    (status: number) => {
      blockedAccessRef.current = status;
      setBlockedAccess(status);
      clearPrivateData();
      accountRef.current.reportAccess(status);
    },
    [clearPrivateData],
  );

  const fetchAll = useCallback(async () => {
    const session = accountRef.current;
    if (
      session.state !== "ready" ||
      !session.account?.user ||
      (!readOnly && !session.account.isStaff) ||
      session.account.sessionKey !== user.sessionKey ||
      blockedAccessRef.current !== null ||
      !currentAccessRef.current
    )
      return;
    const requestGeneration = drafts.invalidate();
    if (readOnly) {
      setRecords(sampleEditorialRecords());
      setLoadState("ready");
      return;
    }
    setLoadState("loading");
    setLoadError("");
    try {
      const headers = accountHeaders(user.sessionKey);
      const [s, c, a, m] = await Promise.all([
        fetch(sitePath("/api/admin/submissions"), { cache: "no-store", headers }),
        fetch(sitePath("/api/admin/content"), { cache: "no-store", headers }),
        fetch(sitePath("/api/admin/audit"), { cache: "no-store", headers }),
        fetch(sitePath("/api/admin/military"), { cache: "no-store", headers }),
      ]);
      const results = await Promise.all(
        [s, c, a, m].map(async (response) => ({
          response,
          body: await response.json().catch(() => ({})),
        })),
      );
      const failed = results.find(({ response }) => !response.ok);
      if (failed) {
        const error = Object.assign(
          new Error(
            responseError(
              failed.body,
              "Could not load the editorial workspace.",
            ),
          ),
          {
            status: failed.response.status,
            code: responseCode(failed.body),
          },
        );
        throw error;
      }
      if (!drafts.isCurrent(requestGeneration)) return;
      const [submissionBody, contentBody, auditBody, militaryBody] = results.map(
        ({ body }) => body as Record<string, unknown>,
      );
      setSubmissions(
        Array.isArray(submissionBody.submissions)
          ? (submissionBody.submissions as Submission[])
          : [],
      );
      setRecords(
        Array.isArray(contentBody.records)
          ? (contentBody.records as EditorialRecord[])
          : [],
      );
      applyMilitary(militaryBody);
      setEvents(
        Array.isArray(auditBody.events)
          ? (auditBody.events as AuditEvent[])
          : [],
      );
      setLoadState("ready");
    } catch (error) {
      if (requestGeneration !== drafts.generation()) return;
      const status =
        typeof error === "object" && error && "status" in error
          ? Number(error.status)
          : 0;
      const code =
        typeof error === "object" && error && "code" in error
          ? String(error.code)
          : "";
      if (status === 401 || status === 403 || code === "ACCOUNT_CHANGED") {
        blockAccess(status || 409);
        return;
      }
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not load the editorial workspace.",
      );
      setLoadState("error");
    }
  }, [blockAccess, drafts, readOnly, user.sessionKey]);

  const currentAccessRef = useRef(currentAccountMatches);
  currentAccessRef.current = currentAccountMatches;

  useEffect(() => {
    if (currentAccountMatches) void fetchAll();
    else if (accountSession.state === "ready" || blockedAccess !== null)
      clearPrivateData();
    else drafts.invalidate();
  }, [
    currentAccountMatches,
    accountSession.state,
    blockedAccess,
    fetchAll,
    clearPrivateData,
    drafts,
  ]);

  const selected =
    submissions.find((submission) => submission.id === selectedId) ?? null;
  const selectedRecord =
    records.find((record) => record.id === recordId) ?? null;
  const pending = submissions.filter(
    (item) => item.status === "pending",
  ).length;
  const returned = submissions.filter(
    (item) => item.status === "changes_requested",
  ).length;
  const filteredSubmissions = useMemo(
    () =>
      submissions.filter((item) => {
        const query = search.trim().toLowerCase();
        return (
          (filterStatus === "all" || item.status === filterStatus) &&
          (filterCategory === "all" || item.data.category === filterCategory) &&
          (!query ||
            [
              item.data.title,
              item.data.photographer,
              item.data.aircraft,
              item.data.registration,
              item.data.location,
            ]
              .join(" ")
              .toLowerCase()
              .includes(query))
        );
      }),
    [submissions, filterStatus, filterCategory, search],
  );

  /** Reports a request that did not succeed. A stale response is dropped silently. */
  function failed(outcome: Outcome, refreshOnConflict = false) {
    switch (outcome.kind) {
      case "ok":
      case "stale":
        return;
      case "blocked":
        blockAccess(outcome.status);
        return;
      case "conflict":
        setNotice({
          kind: "error",
          text: `${outcome.message} Your form has been kept. Select the item again to load its latest version; that replaces your unsaved changes.`,
        });
        if (refreshOnConflict) void fetchAll();
        return;
      case "refused":
        setNotice({
          kind: "error",
          text: outcome.errors.length
            ? `${outcome.message} ${outcome.errors.join(" ")}`
            : outcome.message,
        });
        return;
      case "inactive":
        setNotice({ kind: "error", text: outcome.message });
    }
  }
  function openSubmission(item: Submission) {
    setSelectedId(item.id);
    drafts.open(`submission:${item.id}`, item.version);
    setChecks({ ...emptyChecks(), ...item.checks });
    setReviewNote(item.reviewNote ?? "");
    setNotice(null);
  }
  function openRecord(record: EditorialRecord) {
    setRecordId(record.id);
    drafts.open(`content:${record.id}`, record.version);
    setRecordData(seedData(record));
    setDateKey(record.dateKey ?? new Date().toLocaleDateString("en-CA"));
    setNotice(null);
  }
  async function review(next: SubmissionStatus) {
    if (!selected) return;
    const localError = reviewError(
      selected.data,
      selected.status,
      next,
      checks,
      reviewNote,
    );
    if (localError) {
      setNotice({ kind: "error", text: localError });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await drafts.save(
        `submission:${selected.id}`,
        "PATCH",
        `/api/admin/submissions/${selected.id}`,
        { status: next, checks, note: reviewNote },
        (body) => (body.submission as Submission | undefined)?.version,
      );
      if (outcome.kind !== "ok") return failed(outcome, true);
      const updated = outcome.body.submission as Submission;
      setSubmissions((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice({
        kind: "success",
        text:
          next === "approved"
            ? "Submission approved for editorial use. No game content was published."
            : next === "rejected"
              ? "Submission rejected."
              : "Changes requested from the contributor.",
      });
      if (next !== "approved") setSelectedId("");
      await fetchAll();
    } finally {
      setBusy(false);
    }
  }
  async function createContent(
    payload:
      | { kind: "identifier" | "potd"; sourceId: string }
      | { kind: "identifier" | "potd"; sample: true },
  ) {
    const outcome = await drafts.request("POST", "/api/admin/content", payload);
    if (outcome.kind !== "ok") {
      failed(outcome);
      return null;
    }
    const created = outcome.body.record as EditorialRecord;
    setRecords((previous) => [
      created,
      ...previous.filter((item) => item.id !== created.id),
    ]);
    openRecord(created);
    return created;
  }
  async function createFromSubmission(kind: "identifier" | "potd") {
    if (!selected) return;
    setBusy(true);
    setNotice(null);
    try {
      if (await createContent({ kind, sourceId: selected.id }))
        setSection(
          kind === "identifier" ? "Aircraft Identifier" : "Plane of the Day",
        );
    } finally {
      setBusy(false);
    }
  }
  async function createSample(kind: "identifier" | "potd") {
    setBusy(true);
    setNotice(null);
    try {
      await createContent({ kind, sample: true });
    } finally {
      setBusy(false);
    }
  }
  async function loadDemoData() {
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await drafts.request("POST", "/api/admin/demo", {});
      if (outcome.kind !== "ok") return failed(outcome);
      await fetchAll();
      setNotice({
        kind: "success",
        text: "Demo records loaded; these cannot be published.",
      });
    } finally {
      setBusy(false);
    }
  }
  async function saveRecord(status: EditorialRecord["status"]) {
    if (!selectedRecord || !recordData) return;
    if (status === "scheduled" || status === "published") {
      const errors = editorialErrors(selectedRecord.kind, recordData);
      if (errors.length) {
        setNotice({ kind: "error", text: errors.join(" ") });
        return;
      }
      if (!selectedRecord.sourceId) {
        setNotice({
          kind: "error",
          text: "This sample is preview-only. Create content from an approved submission with the required rights to publish.",
        });
        return;
      }
    }
    const effectiveStatus =
      status === "published" && selectedRecord.kind === "potd"
        ? "scheduled"
        : status;
    const effectiveDate =
      selectedRecord.kind === "potd" && status === "published"
        ? new Date().toLocaleDateString("en-CA")
        : dateKey;
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await drafts.save(
        `content:${selectedRecord.id}`,
        "PUT",
        `/api/admin/content/${selectedRecord.id}`,
        {
          data: recordData,
          status: effectiveStatus,
          dateKey: effectiveStatus === "scheduled" ? effectiveDate : dateKey,
        },
        (body) => (body.record as EditorialRecord | undefined)?.version,
      );
      if (outcome.kind !== "ok") return failed(outcome, true);
      const updated = outcome.body.record as EditorialRecord;
      setRecords((previous) =>
        previous.map((record) => (record.id === updated.id ? updated : record)),
      );
      setRecordData(seedData(updated));
      setDateKey(updated.dateKey ?? effectiveDate);
      setNotice({
        kind: "success",
        text:
          selectedRecord.kind === "identifier" && status === "published"
            ? "Marked prototype-ready. This does not connect to the game backend."
            : status === "published"
              ? "Plane of the Day is scheduled for today in your local calendar."
              : status === "archived"
                ? "Content archived."
                : "Draft saved.",
      });
    } finally {
      setBusy(false);
    }
  }

  function applyMilitary(body: Record<string, unknown>) {
    setPackages(
      Array.isArray(body.packages) ? (body.packages as MilitaryPackage[]) : [],
    );
    setReleases(
      Array.isArray(body.releases) ? (body.releases as MilitaryRelease[]) : [],
    );
    const live =
      body.pointer && typeof body.pointer === "object"
        ? (body.pointer as ReleasePointer & { version: number })
        : emptyPointer;
    setPointer(live);
    // A release or restore is based on the pointer the desk last showed.
    drafts.open("military-live", live.version);
  }

  /** Records a batch release, makes an uploaded one live, or restores the previous one. None delivers or publishes. */
  async function changeRelease(
    action: "release" | "restore" | "activate",
    basis = "",
    release?: number,
  ) {
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await drafts.save(
        "military-live",
        "POST",
        `/api/admin/military/releases${action === "release" ? "" : `/${action}`}`,
        action === "release"
          ? { basis, previewed: true }
          : action === "activate"
            ? { release }
            : {},
        (body) => (body.pointer as { version?: number } | undefined)?.version,
        "pointerVersion",
      );
      if (outcome.kind !== "ok") {
        failed(outcome, true);
        return false;
      }
      applyMilitary(outcome.body);
      const current = (outcome.body.pointer as ReleasePointer | undefined)?.current;
      setNotice({
        kind: "success",
        text:
          action !== "restore"
            ? `Release ${current} recorded. Nothing was delivered or published; Military stays Coming Soon.`
            : `Release ${current} is current again.`,
      });
      return true;
    } finally {
      setBusy(false);
    }
  }

  /** The package editor opened a question: later saves are based on this version. */
  function openMilitary(aircraftId: string, version: number) {
    drafts.open(`military:${aircraftId}`, version);
  }
  async function saveMilitary(
    aircraft: MilitaryAircraft,
    stage: MilitaryStage,
    data: MilitaryPackageData,
  ): Promise<MilitaryPackage | null> {
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await drafts.save(
        `military:${aircraft.id}`,
        "PUT",
        `/api/admin/military/${aircraft.id}`,
        { stage, data },
        (body) => (body.package as MilitaryPackage | undefined)?.version,
      );
      if (outcome.kind !== "ok") {
        failed(outcome, true);
        return null;
      }
      const updated = outcome.body.package as MilitaryPackage;
      setPackages((previous) => [
        ...previous.filter((item) => item.aircraftId !== updated.aircraftId),
        updated,
      ]);
      setNotice({
        kind: "success",
        text:
          stage === "approved"
            ? `${aircraft.name} approved. Nothing was published; Military stays Coming Soon.`
            : `${aircraft.name} saved as ${stage.replaceAll("_", " ")}.`,
      });
      return updated;
    } finally {
      setBusy(false);
    }
  }

  const contentKind = section === "Aircraft Identifier" ? "identifier" : "potd";
  const contentRecords = records.filter(
    (record) =>
      record.kind === contentKind &&
      (showArchived || record.status !== "archived"),
  );

  if (!currentAccountMatches) {
    const sessionError = accountSession.state === "error";
    const signedOut =
      accountSession.state === "ready" && !accountSession.account?.user;
    const permissionDenied =
      blockedAccess === 403 ||
      (accountSession.state === "ready" &&
        !!accountSession.account?.user &&
        !accountSession.account.isStaff);
    const changed =
      accountSession.state === "ready" &&
      !!accountSession.account?.user &&
      accountSession.account.sessionKey !== user.sessionKey;
    return (
      <main className="admin-gate" id="main">
        <section
          className="admin-gate-card"
          role={sessionError || permissionDenied ? "alert" : undefined}
        >
          <p className="eyebrow">EDITORIAL WORKSPACE</p>
          <h1>
            {sessionError
              ? "Account check unavailable"
              : permissionDenied
                ? "Staff access required"
                : signedOut
                  ? "Sign in to continue"
                  : changed || blockedAccess
                    ? "Account session changed"
                    : "Checking account…"}
          </h1>
          <p>
            {sessionError
              ? "We could not confirm this account. Retry the check before continuing."
              : permissionDenied
                ? "This account no longer has staff access to the editorial workspace."
                : signedOut
                  ? "Your sign-in expired. Sign in again to reopen the workspace."
                  : changed || blockedAccess
                    ? "Private editorial data was cleared and pending writes were stopped. Sign in again or reload after choosing the account you want to use."
                    : "Confirming your staff session before loading private editorial data."}
          </p>
          <AccountActions
            onRetry={
              sessionError ? () => void accountSession.refresh() : undefined
            }
            signInHref={
              signedOut || changed || blockedAccess === 401
                ? accountSignInPath("/admin")
                : null
            }
            reloadLabel="Reload workspace"
          />
        </section>
      </main>
    );
  }

  return (
    <FluentProvider
      theme={{
        ...fluentTheme,
        colorNeutralBackground1: "var(--surface)",
        colorNeutralBackground2: "var(--panel)",
        colorNeutralForeground1: "var(--ink)",
        colorNeutralForeground2: "var(--muted)",
        colorNeutralForeground4: "var(--muted)",
        colorNeutralStroke1: "var(--line)",
        colorNeutralForegroundOnBrand: "#fff9ee",
        colorBrandBackground: brandBackground,
        colorBrandBackgroundHover: "#92301f",
        colorBrandForeground1: "var(--brass)",
        colorStatusSuccessBackground1: "var(--panel)",
        colorStatusSuccessForeground1: "var(--success)",
        colorStatusDangerBackground1: "var(--panel)",
        colorStatusDangerForeground1: "var(--error)",
        fontFamilyBase: "Poppins, sans-serif",
        fontFamilyNumeric: "Poppins, sans-serif",
      }}
      className="admin-fluent"
    >
      <div className="admin-app">
        <div className="admin-layout">
          <aside className="admin-sidebar">
            <div className="admin-brand">
              <Brand />
              <span className="admin-brand-caption">
                {readOnly ? "Demo preview · view only" : "Editorial workspace"}
              </span>
            </div>
            <nav aria-label="Admin sections" className="admin-nav">
              <span className="admin-nav-caption">WORKSPACE</span>
              {(readOnly
                ? navItems.filter(
                    ({ label }) =>
                      label !== "Submissions" &&
                      label !== "Military readiness" &&
                      label !== "Activity",
                  )
                : navItems
              ).map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  onClick={() => {
                    setSection(label);
                    setSelectedId("");
                    setRecordId("");
                    setNotice(null);
                  }}
                  className={`admin-nav-item ${section === label ? "active" : ""}`}
                  aria-current={section === label ? "page" : undefined}
                >
                  <Icon
                    size={19}
                    weight={section === label ? "fill" : "regular"}
                  />
                  {label}
                  {label === "Submissions" && pending > 0 && (
                    <span className="admin-nav-count">{pending}</span>
                  )}
                </button>
              ))}
            </nav>
            <div className="admin-side-bottom">
              <ShieldCheck size={17} />
              <span>
                {readOnly ? "Sample drafts" : "Private editorial tools"}
                <br />
                <small>
                  {readOnly
                    ? "Viewing only; nothing can be changed"
                    : "Changes are recorded in Activity"}
                </small>
              </span>
            </div>
          </aside>
          <main className="admin-main">
            <header className="admin-topbar">
              <div className="admin-topbar-title">
                <span className="admin-breadcrumb">Editorial /</span>
                <b>{section}</b>
              </div>
              <div className="admin-topbar-tools">
                <ThemeToggle />
                <AccountControl />
              </div>
            </header>
            <div className="admin-content">
              {notice && (
                <div
                  className={`admin-message ${notice.kind}`}
                  role={notice.kind === "error" ? "alert" : "status"}
                >
                  <MessageBar
                    intent={notice.kind === "error" ? "error" : "success"}
                  >
                    <MessageBarBody>{notice.text}</MessageBarBody>
                  </MessageBar>
                  <button
                    className="admin-message-close"
                    aria-label="Dismiss"
                    onClick={() => setNotice(null)}
                  >
                    ×
                  </button>
                </div>
              )}
              {loadState === "loading" && (
                <div className="admin-loading" aria-label="Loading workspace">
                  {[0, 1, 2].map((item) => (
                    <div className="skeleton" key={item} />
                  ))}
                </div>
              )}
              {loadState === "error" && (
                <section className="admin-panel admin-load-error">
                  <h2>Could not load the workspace</h2>
                  <p className="error">{loadError}</p>
                  <Button
                    appearance="primary"
                    icon={<ArrowClockwise size={17} />}
                    onClick={() => void fetchAll()}
                  >
                    Retry
                  </Button>
                </section>
              )}
              {loadState === "ready" && (
                <>
                  {section === "Overview" && (
                    <Overview
                      submissions={submissions}
                      records={records}
                      pending={pending}
                      returned={returned}
                      events={events}
                      onNavigate={setSection}
                      onOpen={openSubmission}
                      onLoadDemo={loadDemoData}
                      loadingDemo={busy}
                      readOnly={readOnly}
                    />
                  )}
                  {section === "Submissions" && (
                    <Submissions
                      submissions={filteredSubmissions}
                      selected={selected}
                      status={filterStatus}
                      category={filterCategory}
                      search={search}
                      setStatus={setFilterStatus}
                      setCategory={setFilterCategory}
                      setSearch={setSearch}
                      onOpen={openSubmission}
                      checks={checks}
                      setChecks={setChecks}
                      note={reviewNote}
                      setNote={setReviewNote}
                      onReview={review}
                      onCreate={createFromSubmission}
                      busy={busy}
                    />
                  )}
                  {(section === "Aircraft Identifier" ||
                    section === "Plane of the Day") && (
                    <ContentWorkspace
                      kind={contentKind}
                      records={contentRecords}
                      selected={selectedRecord}
                      data={recordData}
                      dateKey={dateKey}
                      setDateKey={setDateKey}
                      onOpen={openRecord}
                      onChange={setRecordData}
                      onSave={saveRecord}
                      onCreateSample={() => void createSample(contentKind)}
                      busy={busy}
                      showArchived={showArchived}
                      setShowArchived={setShowArchived}
                      readOnly={readOnly}
                    />
                  )}
                  {section === "Military readiness" && !readOnly && (
                    <MilitaryWorkspace
                      packages={packages}
                      releases={releases}
                      pointer={pointer}
                      onRelease={changeRelease}
                      submissions={submissions}
                      busy={busy}
                      onOpen={openMilitary}
                      onSave={saveMilitary}
                    />
                  )}
                  {section === "Activity" && <Activity events={events} />}
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </FluentProvider>
  );
}

function Overview({
  submissions,
  records,
  pending,
  returned,
  events,
  onNavigate,
  onOpen,
  onLoadDemo,
  loadingDemo,
  readOnly,
}: {
  submissions: Submission[];
  records: EditorialRecord[];
  pending: number;
  returned: number;
  events: AuditEvent[];
  onNavigate: (section: Section) => void;
  onOpen: (item: Submission) => void;
  onLoadDemo: () => void;
  loadingDemo: boolean;
  readOnly: boolean;
}) {
  const queue = submissions
    .filter(
      (item) =>
        item.status === "pending" || item.status === "changes_requested",
    )
    .slice(0, 5);
  return (
    <>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">EDITORIAL OPERATIONS</p>
          <h1>{readOnly ? "Demo preview" : "Good to have you back."}</h1>
          <p>
            {readOnly
              ? "Browse the sample editorial drafts. This demo account can view content but cannot edit, review or publish."
              : "Review community photographs and prepare content for the public prototype."}
          </p>
        </div>
        {!readOnly && (
        <div className="admin-heading-actions">
          <Button
            appearance="primary"
            onClick={() => onNavigate("Submissions")}
            icon={<ClipboardText size={17} />}
          >
            Review submissions
          </Button>
          {
            <Button
              disabled={loadingDemo}
              onClick={onLoadDemo}
              icon={<Newspaper size={17} />}
            >
              {loadingDemo ? "Loading demo…" : "Load demo data"}
            </Button>
          }
        </div>
        )}
      </div>
      <div className="admin-stats">
        {!readOnly && (
        <>
        <Stat
          label="Awaiting review"
          value={pending}
          detail="Submissions in the review queue"
          icon={<ClipboardText size={20} />}
          onClick={() => onNavigate("Submissions")}
        />
        <Stat
          label="Changes requested"
          value={returned}
          detail="Returned to contributors"
          icon={<ArrowClockwise size={20} />}
          onClick={() => onNavigate("Submissions")}
        />
        </>
        )}
        <Stat
          label="Content records"
          value={records.length}
          detail="Drafts, scheduled and published"
          icon={<Newspaper size={20} />}
          onClick={() => onNavigate("Aircraft Identifier")}
        />
        {!readOnly && (
        <Stat
          label="Recent activity"
          value={events.length}
          detail="Events available in the audit log"
          icon={<ClockCounterClockwise size={20} />}
          onClick={() => onNavigate("Activity")}
        />
        )}
      </div>
      <div className="admin-split">
        {!readOnly && (
        <section className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <h2>Actionable queue</h2>
              <p>Pending reviews and contributor updates</p>
            </div>
            <button
              className="admin-text-button"
              onClick={() => onNavigate("Submissions")}
            >
              View all <span>→</span>
            </button>
          </div>
          {queue.length ? (
            <div className="admin-queue">
              {queue.map((item) => (
                <button
                  className="admin-queue-row"
                  key={item.id}
                  onClick={() => {
                    onNavigate("Submissions");
                    onOpen(item);
                  }}
                >
                  <img className="admin-row-photo" src={sitePath(item.photoUrl)} alt="" />
                  <span className="queue-copy">
                    <b>{item.data.title}</b>
                    <small>
                      {item.data.photographer} ·{" "}
                      {categoryNames[item.data.category]}
                    </small>
                  </span>
                  <StatusBadge status={item.status} />
                  <span className="queue-arrow">→</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="admin-empty">
              <CheckCircle size={25} />
              <b>Nothing needs attention</b>
              <span>New submissions will appear here.</span>
            </div>
          )}
        </section>
        )}
        <section className="admin-panel overview-shortcuts">
          <div className="admin-panel-header">
            <div>
              <h2>Editorial desks</h2>
              <p>
                {readOnly
                  ? "View the sample content for each desk"
                  : "Continue preparing approved material"}
              </p>
            </div>
          </div>
          <button onClick={() => onNavigate("Aircraft Identifier")}>
            <span className="shortcut-icon">
              <AirplaneInFlight size={19} />
            </span>
            <span>
              <b>Aircraft Identifier</b>
              <small>
                {
                  records.filter(
                    (item) =>
                      item.kind === "identifier" && item.status !== "archived",
                  ).length
                }{" "}
                records
              </small>
            </span>
            <span>→</span>
          </button>
          <button onClick={() => onNavigate("Plane of the Day")}>
            <span className="shortcut-icon">
              <ImageSquare size={19} />
            </span>
            <span>
              <b>Plane of the Day</b>
              <small>
                {
                  records.filter(
                    (item) =>
                      item.kind === "potd" && item.status !== "archived",
                  ).length
                }{" "}
                records
              </small>
            </span>
            <span>→</span>
          </button>
        </section>
      </div>
      <p className="admin-demo-note">
        Editorial records on this site prepare prototype content. They do not
        publish into the game backend.
      </p>
    </>
  );
}

function Stat({
  label,
  value,
  detail,
  icon,
  onClick,
}: {
  label: string;
  value: number;
  detail: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="admin-stat" onClick={onClick}>
      <span className="stat-icon">{icon}</span>
      <span className="stat-label">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </button>
  );
}

function Submissions({
  submissions,
  selected,
  status,
  category,
  search,
  setStatus,
  setCategory,
  setSearch,
  onOpen,
  checks,
  setChecks,
  note,
  setNote,
  onReview,
  onCreate,
  busy,
}: {
  submissions: Submission[];
  selected: Submission | null;
  status: string;
  category: string;
  search: string;
  setStatus: (value: string) => void;
  setCategory: (value: string) => void;
  setSearch: (value: string) => void;
  onOpen: (item: Submission) => void;
  checks: ReviewChecks;
  setChecks: (value: ReviewChecks) => void;
  note: string;
  setNote: (value: string) => void;
  onReview: (value: SubmissionStatus) => void;
  onCreate: (kind: "identifier" | "potd") => void;
  busy: boolean;
}) {
  const [compactDetail, setCompactDetail] = useState(Boolean(selected));
  return (
    <>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">COMMUNITY PHOTOGRAPHY</p>
          <h1>Submissions</h1>
          <p>
            Verify the photo, its facts and each proposed use before approving.
          </p>
        </div>
        <span className="admin-total">{submissions.length} shown</span>
      </div>
      <div className="admin-toolbar">
        <Input
          aria-label="Search submissions"
          placeholder="Search title, aircraft, photographer…"
          value={search}
          onChange={(_, data) => setSearch(data.value)}
          contentBefore={<span aria-hidden="true">⌕</span>}
        />
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">All statuses</option>
          {["pending", "changes_requested", "approved", "rejected"].map(
            (item) => (
              <option key={item} value={item}>
                {displayStatus(item)}
              </option>
            ),
          )}
        </select>
        <select
          aria-label="Filter by category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="all">All categories</option>
          {Object.entries(categoryNames).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div
        className={`admin-split submissions-split ${selected ? "has-selection" : ""}`}
      >
        <section
          className={`admin-panel admin-table-wrap ${selected && compactDetail ? "mobile-hidden" : ""}`}
        >
          <div className="admin-panel-header">
            <div>
              <h2>Photo proposals</h2>
              <p>Most recent submissions first</p>
            </div>
          </div>
          {submissions.length ? (
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Photo</th>
                    <th>Submission</th>
                    <th>Category</th>
                    <th>Received</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((item) => (
                    <tr
                      key={item.id}
                      className={selected?.id === item.id ? "selected" : ""}
                      onClick={() => {
                        onOpen(item);
                        setCompactDetail(true);
                      }}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onOpen(item);
                          setCompactDetail(true);
                        }
                      }}
                    >
                      <td>
                        <img
                          className="admin-row-photo"
                          src={sitePath(item.photoUrl)}
                          alt=""
                        />
                      </td>
                      <td>
                        <b>{item.data.title}</b>
                        <small>{item.data.photographer}</small>
                      </td>
                      <td>{categoryNames[item.data.category]}</td>
                      <td>{prettyDate(item.createdAt)}</td>
                      <td>
                        <StatusBadge status={item.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-empty">
              <ImageSquare size={26} />
              <b>No matching submissions</b>
              <span>Try a different filter, or check again later.</span>
            </div>
          )}
        </section>
        {selected && (
          <SubmissionDetail
            submission={selected}
            checks={checks}
            setChecks={setChecks}
            note={note}
            setNote={setNote}
            onReview={onReview}
            onCreate={onCreate}
            busy={busy}
            onBack={() => setCompactDetail(false)}
          />
        )}
        {!selected && (
          <section className="admin-panel detail-placeholder">
            <ImageSquare size={28} />
            <b>Select a submission</b>
            <p>Review its photo, facts, consent and proposed use here.</p>
          </section>
        )}
      </div>
    </>
  );
}

function SubmissionDetail({
  submission,
  checks,
  setChecks,
  note,
  setNote,
  onReview,
  onCreate,
  busy,
  onBack,
}: {
  submission: Submission;
  checks: ReviewChecks;
  setChecks: (value: ReviewChecks) => void;
  note: string;
  setNote: (value: string) => void;
  onReview: (value: SubmissionStatus) => void;
  onCreate: (kind: "identifier" | "potd") => void;
  busy: boolean;
  onBack: () => void;
}) {
  const data = submission.data;
  const canReview =
    submission.status === "pending" ||
    submission.status === "changes_requested";
  return (
    <section className="admin-panel review-panel">
      <button className="admin-back" onClick={onBack}>
        <ArrowLeft size={16} /> Back to submissions
      </button>
      <div className="review-panel-title">
        <div>
          <p className="eyebrow">SUBMISSION DETAIL</p>
          <h2>{data.title}</h2>
          <StatusBadge status={submission.status} />
        </div>
      </div>
      <a
        className="admin-photo-link"
        href={sitePath(submission.photoUrl)}
        target="_blank"
        rel="noreferrer"
      >
        <img
          className="admin-photo"
          src={sitePath(submission.photoUrl)}
          alt={`Submitted photo: ${data.title}`}
        />
        <span>Open full photo ↗</span>
      </a>
      <div className="admin-metadata">
        <div>
          <span>Photographer</span>
          <b>{data.photographer}</b>
        </div>
        <div>
          <span>Category</span>
          <b>
            {categoryNames[data.category]}
            {data.customCategory ? ` · ${data.customCategory}` : ""}
          </b>
        </div>
        <div>
          <span>Image dimensions</span>
          <b>
            {submission.width} × {submission.height} px ·{" "}
            {(submission.imageBytes / 1048576).toFixed(1)} MB
          </b>
        </div>
        <div>
          <span>Captured</span>
          <b>{data.capturedOn || "Not provided"}</b>
        </div>
        <div>
          <span>Aircraft / subject</span>
          <b>{data.aircraft || "Not provided"}</b>
        </div>
        <div>
          <span>Registration</span>
          <b>{data.registration || "Not provided"}</b>
        </div>
        <div>
          <span>Airline</span>
          <b>{data.airline || "Not provided"}</b>
        </div>
        <div>
          <span>Location / airport</span>
          <b>
            {[data.location, data.airportCode].filter(Boolean).join(" · ") ||
              "Not provided"}
          </b>
        </div>
      </div>
      <div className="admin-detail-copy">
        <h3>Description</h3>
        <p>{data.description}</p>
      </div>
      <div className="admin-detail-copy">
        <h3>Evidence & consent</h3>
        <p>
          <b>Credit:</b> {data.credit}
        </p>
        <p>
          <b>Rights basis:</b>{" "}
          {data.rightsBasis === "owner"
            ? "Photographer owns the image"
            : "Permission / license provided"}
        </p>
        <p>
          <b>Rights evidence:</b> {data.rightsEvidence || "No details provided"}
        </p>
        <p>
          <b>Factual source:</b>{" "}
          {data.factualSource ? (
            <a href={data.factualSource} target="_blank" rel="noreferrer">
              {data.factualSource} ↗
            </a>
          ) : (
            "No source provided"
          )}
        </p>
        <p>
          <b>Contact:</b> <a href={`mailto:${data.email}`}>{data.email}</a>
          {data.portfolio && (
            <>
              {" "}
              ·{" "}
              <a href={data.portfolio} target="_blank" rel="noreferrer">
                Portfolio ↗
              </a>
            </>
          )}
        </p>
        <p>
          <b>Image origin:</b> {data.imageOrigin} · Private review consent{" "}
          {data.consent ? "recorded" : "not recorded"}
        </p>
      </div>
      <div className="admin-detail-copy">
        <h3>Proposed channels</h3>
        <div className="channel-chips">
          {data.channels.map((channel) => (
            <span key={channel}>{channelNames[channel]}</span>
          ))}
        </div>
        {data.targetGames.length > 0 && (
          <p>
            <b>Requested games:</b> {data.targetGames.join(", ")}
          </p>
        )}
      </div>
      {canReview ? (
        <div className="review-form">
          <div className="review-divider">
            <span>EDITOR REVIEW</span>
          </div>
          <fieldset className="review-checks">
            <legend>Verification checks</legend>
            {checkNames.map(({ key, label }) => (
              <Checkbox
                key={key}
                checked={checks[key] === true}
                label={label}
                onChange={(_, data) =>
                  setChecks({ ...checks, [key]: data.checked === true })
                }
              />
            ))}
          </fieldset>
          <label className="admin-field">
            <span>
              Review note{" "}
              <small>
                Required for a change request or rejection (10 characters
                minimum)
              </small>
            </span>
            <Textarea
              value={note}
              onChange={(_, data) => setNote(data.value)}
              rows={3}
              maxLength={2400}
              placeholder="Explain what needs attention, or leave a private note for the review record."
            />
          </label>
          <div className="admin-actions review-actions">
            <Button
              disabled={busy}
              onClick={() => onReview("changes_requested")}
            >
              Request changes
            </Button>
            <Button disabled={busy} onClick={() => onReview("rejected")}>
              Reject
            </Button>
            <Button
              appearance="primary"
              disabled={busy}
              onClick={() => onReview("approved")}
              icon={<CheckCircle size={17} />}
            >
              {busy ? "Saving…" : "Approve submission"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="review-form">
          <p className="admin-demo-note">
            This review is closed. Approval permits editorial use only; it does
            not publish content.
          </p>
          {submission.status === "approved" && (
            <div className="admin-actions">
              <Button
                disabled={!data.channels.includes("games")}
                onClick={() => onCreate("identifier")}
              >
                Use in Aircraft Identifier
              </Button>
              <Button
                disabled={!data.channels.includes("plane-of-the-day")}
                onClick={() => onCreate("potd")}
              >
                Use for Plane of the Day
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ContentWorkspace({
  kind,
  records,
  selected,
  data,
  dateKey,
  setDateKey,
  onOpen,
  onChange,
  onSave,
  onCreateSample,
  busy,
  showArchived,
  setShowArchived,
  readOnly,
}: {
  kind: "identifier" | "potd";
  records: EditorialRecord[];
  selected: EditorialRecord | null;
  data: EditorialData | null;
  dateKey: string;
  setDateKey: (value: string) => void;
  onOpen: (record: EditorialRecord) => void;
  onChange: (data: EditorialData | null) => void;
  onSave: (status: EditorialRecord["status"]) => void;
  onCreateSample: () => void;
  busy: boolean;
  showArchived: boolean;
  setShowArchived: (value: boolean) => void;
  readOnly: boolean;
}) {
  const title =
    kind === "identifier" ? "Aircraft Identifier" : "Plane of the Day";
  const setField = (key: keyof EditorialData, value: string) => {
    if (data) onChange({ ...data, [key]: value });
  };
  return (
    <>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">PROTOTYPE CONTENT</p>
          <h1>{title}</h1>
          <p>
            {kind === "identifier"
              ? "Prepare photo questions and rank-specific content."
              : "Schedule a featured aircraft photo by your local calendar date."}
          </p>
        </div>
        {!readOnly && (
        <Button
          appearance="primary"
          onClick={onCreateSample}
          disabled={busy}
          icon={<ImageSquare size={17} />}
        >
          Load sample content
        </Button>
        )}
      </div>
      <div className="admin-toolbar content-toolbar">
        <label className="admin-check-inline">
          <Checkbox
            checked={showArchived}
            onChange={(_, item) => setShowArchived(item.checked === true)}
            label="Show archived"
          />
        </label>
        <span>
          {records.length} {records.length === 1 ? "record" : "records"}
        </span>
      </div>
      {records.length === 0 && !selected ? (
        <section className="admin-panel admin-content-empty">
          <Newspaper size={32} />
          <h2>No {title} content yet</h2>
          {readOnly ? (
            <p>There is no sample content for this desk.</p>
          ) : (
            <>
          <p>
            Approved submissions with the matching channel permission can be
            added from the submission review. Load a sample to preview the
            editor; sample content cannot be published.
          </p>
          <Button onClick={onCreateSample} disabled={busy}>
            Load sample content
          </Button>
            </>
          )}
        </section>
      ) : (
        <div className="admin-split content-split">
          <section className="admin-panel admin-record-list">
            <div className="admin-panel-header">
              <div>
                <h2>Content records</h2>
                <p>
                  {readOnly
                    ? "Sample drafts · view only"
                    : "Saved in the prototype editorial store"}
                </p>
              </div>
            </div>
            {records.length ? (
              records.map((record) => (
                <button
                  key={record.id}
                  className={`admin-record ${record.id === selected?.id ? "selected" : ""}`}
                  onClick={() => onOpen(record)}
                >
                  <img src={sitePath(record.data.imageUrl)} alt="" />
                  <span>
                    <b>{record.data.title}</b>
                    <small>
                      {record.dateKey
                        ? prettyDate(record.dateKey)
                        : record.data.aircraft}
                    </small>
                  </span>
                  <StatusBadge status={record.status} />
                </button>
              ))
            ) : (
              <div className="admin-empty">
                <b>No visible records</b>
                <span>Try showing archived content.</span>
              </div>
            )}
          </section>
          {selected && data ? (
            <section className="admin-panel content-editor">
              <div className="content-editor-head">
                <div>
                  <button
                    className="admin-back"
                    onClick={() => {
                      onChange(null);
                    }}
                  >
                    <ArrowLeft size={16} /> {readOnly ? "Close" : "Close editor"}
                  </button>
                  <p className="eyebrow">
                    {selected.sourceId
                      ? "APPROVED COMMUNITY PHOTO"
                      : "SAMPLE PREVIEW"}
                  </p>
                  <h2>{readOnly ? "View content" : "Edit content"}</h2>
                  <StatusBadge status={selected.status} />
                </div>
                <span className="editor-version">
                  Version {selected.version}
                </span>
              </div>
              {!selected.sourceId && (
                <MessageBar intent="warning" layout="multiline">
                  <MessageBarBody>
                    {readOnly
                      ? "Sample preview only. The demo account can view this draft but cannot change it."
                      : "Sample preview only. Add content from an approved, rights-verified submission to publish."}
                  </MessageBarBody>
                </MessageBar>
              )}
              <div className="editor-preview">
                <img src={sitePath(data.imageUrl)} alt="" />
                <span className="photo-preview-label">
                  PHOTO PREVIEW ·{" "}
                  {selected.sourceId ? "APPROVED SOURCE" : "SAMPLE"}
                </span>
              </div>
              <fieldset className="form-grid admin-fieldset" disabled={readOnly}>
                <TextField
                  label="Editorial title"
                  value={data.title}
                  onChange={(value) => setField("title", value)}
                />
                <TextField
                  label="Aircraft / subject"
                  value={data.aircraft}
                  onChange={(value) => setField("aircraft", value)}
                />
                <TextField
                  label="Photographer"
                  value={data.photographer}
                  onChange={(value) => setField("photographer", value)}
                />
                <TextField
                  label="Credit line"
                  value={data.credit}
                  onChange={(value) => setField("credit", value)}
                />
                <TextField
                  label="Factual source (https://)"
                  value={data.factualSource}
                  onChange={(value) => setField("factualSource", value)}
                  full
                />
                {kind === "potd" ? (
                  <label className="admin-field full">
                    <span>Photo context</span>
                    <Textarea
                      rows={4}
                      value={data.description}
                      onChange={(_, item) =>
                        setField("description", item.value)
                      }
                    />
                  </label>
                ) : (
                  <>
                    <TextField
                      label="Correct answer"
                      value={data.correctAnswer}
                      onChange={(value) => setField("correctAnswer", value)}
                      full
                    />
                    <div className="admin-field full">
                      <span>Answer options</span>
                      <p className="field-hint">
                        Preview shows choices without identifying the correct
                        answer.
                      </p>
                      <div className="form-grid answer-grid">
                        {data.distractors.map((option, index) => (
                          <TextField
                            key={index}
                            label={`Distractor ${index + 1}`}
                            value={option}
                            onChange={(value) => {
                              const distractors = [...data.distractors];
                              distractors[index] = value;
                              onChange({ ...data, distractors });
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <label className="admin-field">
                      <span>Minimum rank</span>
                      <select
                        value={data.difficulty}
                        onChange={(event) =>
                          setField("difficulty", event.target.value)
                        }
                      >
                        {ranks.map((rank) => (
                          <option key={rank}>{rank}</option>
                        ))}
                      </select>
                    </label>
                    <div className="answer-preview">
                      <span>PLAYER PREVIEW · OPTIONS SHOWN IN MIXED ORDER</span>
                      {[
                        data.distractors[1],
                        data.correctAnswer,
                        data.distractors[0],
                        data.distractors[2],
                      ].map((option, index) => (
                        <div key={index}>
                          <b>{String.fromCharCode(65 + index)}</b>
                          {option || "Answer choice"}
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {kind === "potd" && (
                  <label className="admin-field">
                    <span>
                      Feature date <small>Visitor local calendar date</small>
                    </span>
                    <input
                      type="date"
                      value={dateKey}
                      onChange={(event) => setDateKey(event.target.value)}
                    />
                  </label>
                )}
              </fieldset>
              {!readOnly && (
              <div className="admin-actions editor-actions">
                <Button disabled={busy} onClick={() => onSave("draft")}>
                  Save draft
                </Button>
                {kind === "identifier" ? (
                  <Button
                    appearance="primary"
                    disabled={busy || !selected.sourceId}
                    onClick={() => onSave("published")}
                  >
                    {busy ? "Saving…" : "Mark prototype-ready"}
                  </Button>
                ) : (
                  <>
                    <Button
                      appearance="primary"
                      disabled={busy || !selected.sourceId}
                      onClick={() => onSave("scheduled")}
                    >
                      {busy ? "Saving…" : "Schedule feature"}
                    </Button>
                    <Button
                      disabled={busy || !selected.sourceId}
                      onClick={() => onSave("published")}
                    >
                      Publish for today
                    </Button>
                  </>
                )}
                {selected.status !== "archived" && (
                  <Button
                    appearance="subtle"
                    disabled={busy}
                    onClick={() => onSave("archived")}
                  >
                    Archive
                  </Button>
                )}
              </div>
              )}
              {kind === "identifier" && (
                <p className="admin-demo-note">
                  Prototype-ready marks this website record for review. The game
                  backend is not connected.
                </p>
              )}
              {kind === "potd" && (
                <p className="admin-demo-note">
                  The photo appears on the public prototype for its scheduled
                  date and following days, based on each visitor’s local day.
                </p>
              )}
            </section>
          ) : (
            <section className="admin-panel detail-placeholder">
              <Newspaper size={28} />
              <b>Select a record</b>
              <p>
                {readOnly
                  ? "Choose a sample draft to view it."
                  : "Load a sample or create a record from an approved submission."}
              </p>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function TextField({
  label,
  value,
  onChange,
  full = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  full?: boolean;
}) {
  return (
    <label className={`admin-field ${full ? "full" : ""}`}>
      <span>{label}</span>
      <Input
        value={value}
        maxLength={2400}
        onChange={(_, data) => onChange(data.value)}
      />
    </label>
  );
}

function Activity({ events }: { events: AuditEvent[] }) {
  return (
    <>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">AUDIT LOG</p>
          <h1>Activity</h1>
          <p>Recent editorial changes recorded by the server.</p>
        </div>
        <span className="admin-total">Latest {events.length}</span>
      </div>
      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <h2>Recent events</h2>
            <p>Most recent first · up to 50 events</p>
          </div>
        </div>
        {events.length ? (
          <div className="audit-list">
            {events.map((event, index) => (
              <div
                className="audit-event"
                key={`${event.entity_id}-${event.created_at}-${index}`}
              >
                <span className="audit-mark">
                  <ClockCounterClockwise size={17} />
                </span>
                <div>
                  <b>{event.action.replaceAll("_", " ")}</b>
                  <small>Record {event.entity_id}</small>
                  {event.detail && <small>{event.detail}</small>}
                </div>
                <time>{prettyDate(event.created_at)}</time>
              </div>
            ))}
          </div>
        ) : (
          <div className="admin-empty">
            <ClockCounterClockwise size={25} />
            <b>No activity recorded yet</b>
            <span>Editorial actions will appear here.</span>
          </div>
        )}
      </section>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-badge status-${status.replaceAll("_", "-")}`}>
      {displayStatus(status)}
    </span>
  );
}
