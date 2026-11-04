"use client";

import { Button, Input, MessageBar, MessageBarBody } from "@fluentui/react-components";
import { ArrowClockwise, UsersThree } from "@phosphor-icons/react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { accountHeaders } from "@/lib/account";
import { sitePath } from "@/lib/paths";
import type { AdminRoleRow, RoleAction, RoleState } from "@/lib/request/roles";

/**
 * Users and roles, as the game backend records them (openapi 0.15.0). Admins approve or reject
 * photographer requests, remove a role (the account may ask again), block an account from the
 * photographer role (lasting, until unblocked) and correct an admin's typed email. Every change
 * sends the revision the admin saw; when someone else decided first the list reloads and nothing is
 * overwritten. Granting admin is not offered here: it stays with the backend's operator command.
 */

const views: { state: RoleState; label: string; hint: string }[] = [
  { state: "pending", label: "Awaiting approval", hint: "Photographer requests waiting for a decision" },
  { state: "active", label: "Active", hint: "Accounts that hold a role now" },
  { state: "blocked", label: "Blocked", hint: "Accounts that can't ask to be a photographer until unblocked" },
  {
    state: "revoked",
    label: "Removed",
    hint: "Roles that were taken away or unblocked; the account may ask again",
  },
  { state: "rejected", label: "Rejected", hint: "Photographer requests that were turned down" },
];
const roleLabel = { player: "Player", photographer: "Photographer", admin: "Admin" } as const;
const actionLabel: Record<RoleAction, string> = {
  approve: "Approve",
  reject: "Reject",
  block: "Block",
  unblock: "Unblock",
  revoke: "Remove",
};
const actionDone: Record<RoleAction, string> = {
  approve: "approved as a photographer",
  reject: "turned down",
  block: "blocked from the photographer role",
  unblock: "unblocked and may ask again",
  revoke: "removed from that role",
};
function consequence(row: AdminRoleRow, action: RoleAction) {
  switch (action) {
    case "approve":
      return "They will be able to send photos for review.";
    case "reject":
      return "They can ask again later, and the request will come back here.";
    case "block":
      return "They will lose photographer access, if they had it, and can't ask again until someone unblocks them.";
    case "unblock":
      return "They won't be a photographer, but they will be able to ask again.";
    case "revoke":
      return row.role === "admin"
        ? "They will lose access to this workspace at once."
        : "They will no longer be able to send photos. They can ask again, and the request will come back here. Use Block to stop that.";
  }
}

type Pending = { row: AdminRoleRow; action: RoleAction | "email" } | null;
type Notice = { kind: "error" | "success"; text: string } | null;

function when(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
/** The Firebase UID, shown when the backend recorded no email for the row. */
function uidOf(principal: string) {
  return principal.split(":").at(-1) ?? principal;
}
function who(row: AdminRoleRow) {
  return row.email ?? `Account ${uidOf(row.principal)}`;
}
const rowKey = (row: AdminRoleRow) => `${row.principal}|${row.role}`;

/** A refusal that means this browser's account no longer matches: the workspace handles it. */
class Blocked extends Error {
  constructor(readonly status: number) {
    super("Account access changed.");
  }
}

export function UsersDesk({
  sessionKey,
  onBlocked,
}: {
  sessionKey: string;
  /** The workspace's account fence: clears private data and reports the access change. */
  onBlocked: (status: number) => void;
}) {
  const [state, setState] = useState<RoleState>("pending");
  const stateRef = useRef(state);
  stateRef.current = state;
  const [rows, setRows] = useState<AdminRoleRow[]>([]);
  const [self, setSelf] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [load, setLoad] = useState<"loading" | "ready" | "error">("loading");
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // Only the newest load may write the list, so a slow answer for another view can't replace it.
  const generation = useRef(0);
  const tableRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** Where focus goes once the list has loaded again. */
  const focusAfterLoad = useRef<"notice" | "heading" | null>(null);

  const fetchPage = useCallback(
    async (forState: RoleState, after: string | null) => {
      const query = new URLSearchParams({ state: forState });
      if (after) query.set("cursor", after);
      const response = await fetch(sitePath(`/api/admin/roles?${query}`), {
        cache: "no-store",
        headers: accountHeaders(sessionKey),
      });
      const body = (await response.json().catch(() => ({}))) as {
        requests?: AdminRoleRow[];
        nextCursor?: string | null;
        self?: string;
        error?: string;
        code?: string;
      };
      if (response.status === 401 || body.code === "ACCOUNT_CHANGED" || (response.status === 403 && body.code !== "FORBIDDEN"))
        throw new Blocked(response.status === 401 || response.status === 403 ? response.status : 409);
      if (!response.ok || !body.requests) throw new Error(body.error ?? "The user list could not be loaded.");
      return body as { requests: AdminRoleRow[]; nextCursor: string | null; self: string };
    },
    [sessionKey],
  );

  const reload = useCallback(
    async (keepNotice = false) => {
      const forState = stateRef.current;
      const mine = ++generation.current;
      setLoad("loading");
      setPending(null);
      if (!keepNotice) setNotice(null);
      try {
        const page = await fetchPage(forState, null);
        if (mine !== generation.current) return;
        setRows(page.requests);
        setCursor(page.nextCursor);
        setSelf(page.self);
        setLoad("ready");
      } catch (error) {
        if (mine !== generation.current) return;
        if (error instanceof Blocked) return onBlocked(error.status);
        setRows([]);
        setCursor(null);
        setLoad("error");
        setNotice({ kind: "error", text: error instanceof Error ? error.message : "The user list could not be loaded." });
      }
    },
    [fetchPage, onBlocked],
  );

  useEffect(() => {
    void reload();
  }, [state, reload]);

  // Move focus somewhere sensible after the table was replaced.
  useEffect(() => {
    if (load === "loading" || !focusAfterLoad.current) return;
    const target = focusAfterLoad.current === "notice" && noticeRef.current ? noticeRef.current : headingRef.current;
    focusAfterLoad.current = null;
    target?.focus();
  }, [load, notice]);

  // The note field takes focus when a confirmation opens.
  useEffect(() => {
    if (pending) noteRef.current?.focus();
  }, [pending]);

  function cancel() {
    const opener = pending ? `${rowKey(pending.row)}|${pending.action}` : "";
    setPending(null);
    setNote("");
    // Back to the button that opened the confirmation.
    requestAnimationFrame(() =>
      tableRef.current?.querySelector<HTMLButtonElement>(`[data-opener="${CSS.escape(opener)}"]`)?.focus(),
    );
  }

  async function more() {
    if (!cursor) return;
    const mine = generation.current;
    setBusy(true);
    try {
      const page = await fetchPage(stateRef.current, cursor);
      if (mine !== generation.current) return;
      setRows((old) => [...old, ...page.requests]);
      setCursor(page.nextCursor);
    } catch (error) {
      if (mine !== generation.current) return;
      if (error instanceof Blocked) return onBlocked(error.status);
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "More users could not be loaded." });
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!pending) return;
    const { row, action } = pending;
    const account = encodeURIComponent(row.principal);
    const typed = note.trim();
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(
        sitePath(action === "email" ? `/api/admin/roles/${account}/admin/email` : `/api/admin/roles/${account}/${row.role}/${action}`),
        {
          method: action === "email" ? "PUT" : "POST",
          headers: { "Content-Type": "application/json", ...accountHeaders(sessionKey) },
          body: JSON.stringify(
            action === "email"
              ? { revision: row.revision, email: typed || null }
              : { revision: row.revision, ...(typed ? { note: typed } : {}) },
          ),
        },
      );
      const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
      if (response.status === 401 || body.code === "ACCOUNT_CHANGED" || (response.status === 403 && body.code !== "FORBIDDEN")) {
        onBlocked(response.status === 401 || response.status === 403 ? response.status : 409);
        return;
      }
      if (response.ok) {
        setNote("");
        setNotice({
          kind: "success",
          text:
            action === "email"
              ? typed
                ? `The email for ${uidOf(row.principal)} is now ${typed.toLowerCase()} (unverified).`
                : `The email for ${uidOf(row.principal)} was cleared.`
              : `${who(row)} was ${actionDone[action]}.`,
        });
        focusAfterLoad.current = "notice";
        await reload(true);
      } else if (body.code === "VERSION_CONFLICT") {
        // Someone decided first, or a rule refused it: show the current rows, never resend.
        setNotice({
          kind: "error",
          text:
            action === "revoke" && row.role === "admin"
              ? "This admin couldn't be removed: someone changed it first, or it is the last active admin. The list has been reloaded."
              : action === "block"
                ? "This account couldn't be blocked: someone changed it first, or it holds an active admin role (remove that first). The list has been reloaded."
                : (body.error ?? "Someone changed this account first. The list has been reloaded."),
        });
        focusAfterLoad.current = "notice";
        await reload(true);
      } else {
        setNotice({ kind: "error", text: body.error ?? "The change could not be saved." });
      }
    } catch {
      setNotice({ kind: "error", text: "The change could not be sent. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  function actionsFor(row: AdminRoleRow): (RoleAction | "email")[] {
    if (row.role === "photographer") {
      if (row.state === "pending") return ["approve", "reject", "block"];
      if (row.state === "active") return ["revoke", "block"];
      if (row.state === "rejected" || row.state === "revoked") return ["block"];
      if (row.state === "blocked") return ["unblock"];
    }
    if (row.role === "admin" && (row.state === "active" || row.state === "revoked")) {
      // Your own admin role can't be removed here: that would lock you out of this screen.
      if (row.state === "active" && row.principal !== self) return ["email", "revoke"];
      return ["email"];
    }
    return [];
  }
  const labelOf = (action: RoleAction | "email") => (action === "email" ? "Edit email" : actionLabel[action]);

  const view = views.find((v) => v.state === state)!;
  return (
    <>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">ACCOUNTS</p>
          <h1>Users and roles</h1>
          <p>Who holds which role, as the game backend records it. Approve photographers and block roles here.</p>
        </div>
        <div className="admin-heading-actions">
          <Button icon={<ArrowClockwise />} disabled={load === "loading" || busy} onClick={() => void reload()}>
            Reload
          </Button>
        </div>
      </div>

      {notice && (
        <div
          key={`${notice.kind}:${notice.text}`}
          ref={noticeRef}
          tabIndex={-1}
          className={`admin-message ${notice.kind}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          <MessageBar intent={notice.kind === "error" ? "error" : "success"}>
            <MessageBarBody>{notice.text}</MessageBarBody>
          </MessageBar>
          <button className="admin-message-close" aria-label="Dismiss" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}

      <div className="users-views" role="group" aria-label="Show accounts">
        {views.map((v) => (
          <button
            key={v.state}
            type="button"
            aria-pressed={state === v.state}
            disabled={busy}
            className={`users-view ${state === v.state ? "active" : ""}`}
            onClick={() => setState(v.state)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <section
        className="admin-panel admin-table-wrap"
        aria-labelledby="users-view-title"
        aria-busy={load === "loading"}
      >
        <div className="admin-panel-header">
          <div>
            <h2 id="users-view-title" ref={headingRef} tabIndex={-1}>
              {view.label}
            </h2>
            <p>{view.hint} · oldest request first</p>
          </div>
        </div>
        {load === "loading" ? (
          <div className="admin-empty">
            <b>Loading users…</b>
          </div>
        ) : rows.length ? (
          <div className="admin-table-scroll" ref={tableRef}>
            <table className="admin-table users-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Role</th>
                  <th>Requested</th>
                  <th>Decided</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const key = rowKey(row);
                  const open = pending && rowKey(pending.row) === key ? pending : null;
                  return (
                    <Fragment key={key}>
                      <tr>
                        <td data-label="Account">
                          <b>
                            {who(row)}
                            {row.principal === self && " (you)"}
                          </b>
                          {row.emailSource === "typed" && (
                            <small className="users-unverified">Typed by an admin · unverified</small>
                          )}
                          {!row.email && <small>No email recorded for this role</small>}
                          {row.note && <small>Note: {row.note}</small>}
                        </td>
                        <td data-label="Role">
                          <span className="status-badge users-role">{roleLabel[row.role]}</span>
                        </td>
                        <td data-label="Requested">{when(row.requestedAt)}</td>
                        <td data-label="Decided">{when(row.decidedAt)}</td>
                        <td className="users-actions">
                          {actionsFor(row).map((action) => (
                            <Button
                              key={action}
                              data-opener={`${key}|${action}`}
                              appearance={action === "approve" ? "primary" : "secondary"}
                              disabled={busy || !!pending}
                              onClick={() => {
                                setPending({ row, action });
                                setNote(action === "email" ? (row.grantEmail ?? "") : "");
                              }}
                            >
                              {labelOf(action)}
                            </Button>
                          ))}
                        </td>
                      </tr>
                      {open && (
                        <tr className="users-confirm-row">
                          <td colSpan={5}>
                            <div
                              className="users-confirm"
                              role="group"
                              aria-label={`${labelOf(open.action)} ${who(row)}`}
                              onKeyDown={(event) => {
                                if (event.key === "Escape" && !busy) cancel();
                                if (event.key === "Enter" && open.action === "email" && !busy) void confirm();
                              }}
                            >
                              {open.action === "email" ? (
                                <p>
                                  <b>Email for admin account {uidOf(row.principal)}</b> Shown to admins only and marked
                                  unverified; it never grants access. Leave it empty to clear it.
                                </p>
                              ) : (
                                <p>
                                  <b>
                                    {actionLabel[open.action]} {who(row)} as {roleLabel[row.role].toLowerCase()}?
                                  </b>{" "}
                                  {consequence(row, open.action)}
                                </p>
                              )}
                              <Input
                                ref={noteRef}
                                type={open.action === "email" ? "email" : "text"}
                                aria-label={
                                  open.action === "email" ? "Email address" : "Note (optional, kept in the audit record)"
                                }
                                placeholder={open.action === "email" ? "name@example.com" : "Note (optional)"}
                                value={note}
                                maxLength={open.action === "email" ? 320 : 500}
                                onChange={(_, data) => setNote(data.value)}
                              />
                              <Button appearance="primary" disabled={busy} onClick={() => void confirm()}>
                                {busy
                                  ? "Saving…"
                                  : open.action === "email"
                                    ? "Save email"
                                    : `Confirm ${actionLabel[open.action].toLowerCase()}`}
                              </Button>
                              <Button disabled={busy} onClick={cancel}>
                                Cancel
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {cursor && (
              <div className="users-more">
                <Button disabled={busy} onClick={() => void more()}>
                  Show more
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="admin-empty">
            <UsersThree size={25} />
            <b>{load === "error" ? "The user list is unavailable" : "No accounts in this list"}</b>
          </div>
        )}
      </section>
      <p className="users-footnote">
        Remove takes a role away, and the account may ask again. Block stops an account asking to be a
        photographer until someone unblocks it. An account that is an admin can&apos;t be blocked until its admin
        role is removed. Admins are added with the backend&apos;s operator command, and at least one admin always
        remains.
      </p>
    </>
  );
}
