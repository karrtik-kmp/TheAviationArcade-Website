"use client";

import { Button, Input, MessageBar, MessageBarBody, Radio, RadioGroup } from "@fluentui/react-components";
import { ArrowClockwise, Plus, Storefront } from "@phosphor-icons/react";
import { Fragment, useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { accountHeaders } from "@/lib/account";
import { sitePath } from "@/lib/paths";
import {
  storeHintsMax,
  storeHintsMin,
  storeMilesMax,
  storeMilesMin,
  storePassPeriods,
  storeTitleMax,
  type AdminStoreProduct,
  type StorePassPeriod,
  type StoreProductKind,
} from "@/lib/request/store";
import {
  blockStatusOf,
  contentsLabel,
  draftOf,
  emptyDraft,
  outcomeOf,
  requestBody,
  storeFields,
  storeProductLabel,
  termLabel,
  validateDraft,
  waitText,
  type StoreDraft,
  type StoreErrors,
  type StoreField,
} from "@/lib/store-form";
import { whenLabel as when, type Reply } from "@/lib/store-view";
import { StorePlayer } from "@/components/StorePlayer";
import { StorePurchases } from "@/components/StorePurchases";

/**
 * Store desk (openapi 0.22.0), staff only, three views. Products: the catalog the game app can offer,
 * as the game backend records it; staff create a product, edit its staff label and contents, and
 * retire or restore it. Purchases and Player pass: read-only records. Prices live in the app stores;
 * this website sells nothing. Every product write sends the version the admin saw; when someone else
 * changed the product first the list reloads and nothing is resent or overwritten.
 */

type Notice = { kind: "error" | "success"; text: string } | null;
type Panel =
  | { type: "create" }
  | { type: "edit"; id: string }
  | { type: "confirm"; id: string; action: "retire" | "restore" }
  | null;

const kindChoices: { value: StoreProductKind; label: string }[] = [
  { value: "hint_pack", label: storeProductLabel("hint_pack") },
  { value: "miles_pack", label: storeProductLabel("miles_pack") },
  { value: "first_class_pass", label: storeProductLabel("first_class_pass") },
];
const apiBase = "/api/admin/store/products";

async function callStore(sessionKey: string, path: string, method = "GET", json?: unknown): Promise<Reply> {
  try {
    const response = await fetch(sitePath(path), {
      method,
      cache: "no-store",
      headers: { ...(json === undefined ? {} : { "Content-Type": "application/json" }), ...accountHeaders(sessionKey) },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
    const parsed: unknown = await response.json().catch(() => ({}));
    const body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    return {
      status: response.status,
      code: typeof body.code === "string" ? body.code : "",
      error: typeof body.error === "string" ? body.error : "",
      retryAfter: response.headers.get("Retry-After"),
      body,
    };
  } catch {
    return { status: 0, code: "", error: "", retryAfter: null, body: {} };
  }
}

/** Why a write failed, in words an admin can act on. */
function failureText(reply: Reply, fallback: string) {
  if (reply.status === 0) return "The change could not be sent. Check your connection and try again.";
  if (reply.code === "RATE_LIMITED" || reply.status === 429) return waitText(reply.retryAfter);
  if (reply.code === "STORE_UNAVAILABLE") return "The store catalog isn't available on this server.";
  if (reply.code === "BACKEND_UNAVAILABLE" || reply.status === 503)
    return "The game backend is busy or couldn't be reached. Try again in a moment.";
  return reply.error || fallback;
}

function ProductsView({
  sessionKey,
  onBlocked,
}: {
  sessionKey: string;
  /** The workspace's account fence: clears private data and reports the access change. */
  onBlocked: (status: number) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const [rows, setRows] = useState<AdminStoreProduct[]>([]);
  const [load, setLoad] = useState<"loading" | "ready" | "error">("loading");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [draft, setDraft] = useState<StoreDraft>(emptyDraft);
  const [errors, setErrors] = useState<StoreErrors>({});
  const [formError, setFormError] = useState("");
  // Only the newest load may write the list; writes have their own generation so a reload never
  // swallows a save answer. Both are bumped on unmount and when the account session changes.
  const generation = useRef(0);
  const writeGeneration = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);
  const focusAfterLoad = useRef<"notice" | "heading" | null>(null);

  const reload = useCallback(
    async (keepNotice = false): Promise<"ok" | "failed" | "stale"> => {
      const mine = ++generation.current;
      setLoad("loading");
      if (!keepNotice) setNotice(null);
      const reply = await callStore(sessionKey, apiBase);
      if (mine !== generation.current) return "stale";
      const blocked = blockStatusOf(reply.status, reply.code);
      if (blocked !== null) {
        onBlocked(blocked);
        return "stale";
      }
      const products = reply.status === 200 ? reply.body.products : null;
      if (!Array.isArray(products)) {
        setRows([]);
        setLoad("error");
        setNotice({ kind: "error", text: failureText(reply, "The store catalog could not be loaded.") });
        return "failed";
      }
      setRows(products as AdminStoreProduct[]);
      setLoad("ready");
      return "ok";
    },
    [sessionKey, onBlocked],
  );

  useEffect(() => {
    void reload();
    return () => {
      generation.current += 1;
      writeGeneration.current += 1;
    };
  }, [reload]);

  // A session change abandons any open form and in-flight write.
  useEffect(
    () => () => {
      setPanel(null);
      setBusy(false);
    },
    [sessionKey],
  );

  // Move focus somewhere sensible after the list was replaced or a notice appeared.
  useEffect(() => {
    if (load === "loading" || !focusAfterLoad.current) return;
    const target = focusAfterLoad.current === "notice" && noticeRef.current ? noticeRef.current : headingRef.current;
    focusAfterLoad.current = null;
    target?.focus();
  }, [load, notice]);

  // A panel takes focus when it opens: the confirmation group, or the first editable field.
  const panelKey = panel ? `${panel.type}|${"id" in panel ? panel.id : ""}|${panel.type === "confirm" ? panel.action : ""}` : "";
  const panelRef = useRef(panel);
  panelRef.current = panel;
  useEffect(() => {
    const open = panelRef.current;
    if (!open) return;
    if (open.type === "confirm") confirmRef.current?.focus();
    else document.getElementById(`${uid}-${open.type === "create" ? "productId" : "title"}`)?.focus();
  }, [panelKey, uid]);

  useEffect(() => {
    if (formError) formErrorRef.current?.focus();
  }, [formError]);

  const locked = busy || panel !== null;
  const rowOf = (id: string) => rows.find((row) => row.productId === id);

  // Back to the button that opened a panel, once the panel is gone and the buttons are enabled again
  // (a disabled button can't take focus, so this waits for the render rather than a frame).
  const returnFocusTo = useRef<string | null>(null);
  useEffect(() => {
    const opener = returnFocusTo.current;
    if (!opener || panel !== null || busy) return;
    returnFocusTo.current = null;
    const button = rootRef.current?.querySelector<HTMLButtonElement>(`[data-opener="${CSS.escape(opener)}"]`);
    if (button && !button.disabled) button.focus();
    else headingRef.current?.focus();
  }, [panel, busy]);
  function focusOpener(opener: string) {
    returnFocusTo.current = opener;
  }
  /** Closes the open panel; `opener` null when a notice takes focus instead. */
  function close(opener: string | null) {
    setPanel(null);
    setErrors({});
    setFormError("");
    if (opener) focusOpener(opener);
  }
  function openCreate() {
    setDraft(emptyDraft());
    setErrors({});
    setFormError("");
    setNotice(null);
    setPanel({ type: "create" });
  }
  function openEdit(row: AdminStoreProduct) {
    setDraft(draftOf(row));
    setErrors({});
    setFormError("");
    setNotice(null);
    setPanel({ type: "edit", id: row.productId });
  }
  function openConfirm(row: AdminStoreProduct, action: "retire" | "restore") {
    setNotice(null);
    setPanel({ type: "confirm", id: row.productId, action });
  }
  function cancel() {
    if (!panel) return;
    close(panel.type === "create" ? "new" : `${panel.id}|${panel.type === "confirm" ? panel.action : "edit"}`);
  }
  function patch(change: Partial<StoreDraft>, clear: StoreField[]) {
    setDraft((old) => ({ ...old, ...change }));
    setErrors((old) => {
      const next = { ...old };
      for (const field of clear) delete next[field];
      return next;
    });
  }

  /** One write at a time. Returns the reply, or null when the answer is stale or the account fence took over. */
  async function send(path: string, method: string, json: unknown): Promise<Reply | null> {
    const mine = ++writeGeneration.current;
    setBusy(true);
    setNotice(null);
    setFormError("");
    const reply = await callStore(sessionKey, path, method, json);
    setBusy(false);
    if (mine !== writeGeneration.current) return null;
    const blocked = blockStatusOf(reply.status, reply.code);
    if (blocked !== null) {
      onBlocked(blocked);
      return null;
    }
    return reply;
  }

  /** Someone changed the product first, or it is gone: show the current list, never resend. */
  async function afterReload(id: string, reply: Reply) {
    const result = await reload(true);
    if (result === "stale") return;
    const missing = reply.code === "NOT_FOUND";
    const base = missing ? `${id} wasn't found; it may have been removed.` : `Someone changed ${id} first.`;
    focusAfterLoad.current = "notice";
    setNotice({
      kind: "error",
      text:
        result === "ok"
          ? `${base} The list has been reloaded; check it and decide again.`
          : `${base} The list couldn't be reloaded either; use Reload and check it before deciding again.`,
    });
  }

  /** The write landed: reload, then say so, without claiming a reload that failed. */
  async function announceSaved(text: string) {
    const result = await reload(true);
    if (result === "stale") return;
    focusAfterLoad.current = "notice";
    setNotice({
      kind: "success",
      text: result === "ok" ? text : `${text} The list couldn't be reloaded; use Reload to see it.`,
    });
  }

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    if (busy || !panel || panel.type === "confirm") return;
    const row = panel.type === "edit" ? rowOf(panel.id) : undefined;
    if (panel.type === "edit" && !row) return;
    const found = validateDraft(draft, panel.type, row);
    setErrors(found);
    const firstBad = storeFields.find((field) => found[field]);
    if (firstBad) {
      requestAnimationFrame(() => {
        const element = document.getElementById(`${uid}-${firstBad}`);
        (firstBad === "passPeriod" ? element?.querySelector<HTMLElement>("input") : element)?.focus();
      });
      return;
    }
    const built = requestBody(draft, row);
    if ("none" in built) {
      close(null);
      focusAfterLoad.current = "notice";
      setNotice({ kind: "success", text: "No changes to save." });
      return;
    }
    const id = row ? row.productId : draft.productId;
    const reply = await send(`${apiBase}/${encodeURIComponent(id)}`, "PUT", built.body);
    if (!reply) return;
    const outcome = outcomeOf(reply.status, reply.code);
    if (outcome === "saved") {
      close(null);
      await announceSaved(row ? `Saved changes to ${id}.` : `Created ${id}.`);
    } else if (outcome === "reload" && !row && reply.code === "PRODUCT_EXISTS") {
      // Keep the typed values so they can pick another id.
      const result = await reload(true);
      if (result === "stale") return;
      setErrors({
        productId: `A product with this id already exists (it may be one you just created); the list has ${result === "ok" ? "been reloaded" : "not been reloaded (use Reload)"}.`,
      });
      requestAnimationFrame(() => document.getElementById(`${uid}-productId`)?.focus());
    } else if (outcome === "reload") {
      close(null);
      await afterReload(id, reply);
    } else {
      setFormError(failureText(reply, "The change could not be saved."));
    }
  }

  async function confirmAction() {
    if (busy || !panel || panel.type !== "confirm") return;
    const row = rowOf(panel.id);
    if (!row) return;
    const { action } = panel;
    const reply = await send(`${apiBase}/${encodeURIComponent(row.productId)}/${action}`, "POST", { version: row.version });
    if (!reply) return;
    const outcome = outcomeOf(reply.status, reply.code);
    close(null);
    if (outcome === "saved") {
      await announceSaved(
        action === "retire"
          ? `${row.productId} was retired. The game stops offering it.`
          : `${row.productId} was restored. The game can offer it again.`,
      );
    } else if (outcome === "reload") {
      await afterReload(row.productId, reply);
    } else {
      focusAfterLoad.current = "notice";
      setNotice({
        kind: "error",
        text: failureText(reply, `${row.productId} couldn't be ${action === "retire" ? "retired" : "restored"}.`),
      });
    }
  }

  function errorProps(field: StoreField) {
    const ids = [`${uid}-${field}-hint`, errors[field] ? `${uid}-${field}-error` : ""].filter(Boolean);
    return { "aria-invalid": !!errors[field], "aria-describedby": ids.join(" ") };
  }
  function fieldError(field: StoreField) {
    return (
      errors[field] && (
        <span className="store-error" id={`${uid}-${field}-error`}>
          {errors[field]}
        </span>
      )
    );
  }

  function form(row: AdminStoreProduct | undefined) {
    const editing = row !== undefined;
    const kind = editing ? row.kind : draft.kind;
    return (
      <form
        className="store-form"
        noValidate
        aria-label={editing ? `Edit ${row.productId}` : "New product"}
        onSubmit={(event) => void submitForm(event)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) cancel();
        }}
      >
        <h3>{editing ? `Edit ${row.productId}` : "New product"}</h3>
        {formError && (
          <div className="store-form-alert" role="alert" tabIndex={-1} ref={formErrorRef}>
            {formError}
          </div>
        )}
        <fieldset className="admin-fieldset" disabled={busy}>
          <div className="form-grid">
            {editing ? (
              <dl className="store-facts full">
                <div>
                  <dt>Product id</dt>
                  <dd className="store-id">{row.productId}</dd>
                </div>
                <div>
                  <dt>Kind</dt>
                  <dd>
                    {storeProductLabel(row.kind)} <small>(fixed after create)</small>
                  </dd>
                </div>
                <div>
                  <dt>Placeholder</dt>
                  <dd>
                    {row.demo ? "Yes" : "No"} <small>(fixed after create)</small>
                  </dd>
                </div>
              </dl>
            ) : (
              <>
                <div className="admin-field">
                  <label htmlFor={`${uid}-productId`}>
                    <span>Product id</span>
                  </label>
                  <Input
                    id={`${uid}-productId`}
                    value={draft.productId}
                    maxLength={100}
                    autoComplete="off"
                    spellCheck={false}
                    {...errorProps("productId")}
                    onChange={(_, data) => patch({ productId: data.value }, ["productId"])}
                  />
                  <small className="field-hint" id={`${uid}-productId-hint`}>
                    Lowercase letters, digits, dots and underscores. It must match the id registered in both app stores,
                    and it can&apos;t be changed after create.
                  </small>
                  {fieldError("productId")}
                </div>
                <fieldset className="store-fieldset">
                  <legend>Kind</legend>
                  <RadioGroup
                    layout="horizontal"
                    value={draft.kind}
                    onChange={(_, data) => patch({ kind: data.value as StoreProductKind }, ["hints", "miles", "passPeriod"])}
                  >
                    {kindChoices.map((choice) => (
                      <Radio key={choice.value} value={choice.value} label={choice.label} />
                    ))}
                  </RadioGroup>
                </fieldset>
              </>
            )}
            <div className="admin-field">
              <label htmlFor={`${uid}-title`}>
                <span>Staff label</span>
              </label>
              <Input
                id={`${uid}-title`}
                value={draft.title}
                maxLength={storeTitleMax + 20}
                {...errorProps("title")}
                onChange={(_, data) => patch({ title: data.value }, ["title"])}
              />
              <small className="field-hint" id={`${uid}-title-hint`}>
                Internal, never shown to players. Up to {storeTitleMax} characters.
              </small>
              {fieldError("title")}
            </div>
            {kind === "hint_pack" ? (
              <div className="admin-field">
                <label htmlFor={`${uid}-hints`}>
                  <span>Hints in the pack</span>
                </label>
                <Input
                  id={`${uid}-hints`}
                  value={draft.hints}
                  inputMode="numeric"
                  autoComplete="off"
                  {...errorProps("hints")}
                  onChange={(_, data) => patch({ hints: data.value }, ["hints"])}
                />
                <small className="field-hint" id={`${uid}-hints-hint`}>
                  A whole number from {storeHintsMin} to {storeHintsMax}.
                </small>
                {fieldError("hints")}
              </div>
            ) : kind === "miles_pack" ? (
              <div className="admin-field">
                <label htmlFor={`${uid}-miles`}>
                  <span>Miles in the pack</span>
                </label>
                <Input
                  id={`${uid}-miles`}
                  value={draft.miles}
                  inputMode="numeric"
                  autoComplete="off"
                  {...errorProps("miles")}
                  onChange={(_, data) => patch({ miles: data.value }, ["miles"])}
                />
                <small className="field-hint" id={`${uid}-miles-hint`}>
                  A whole number from {storeMilesMin} to {storeMilesMax.toLocaleString("en-US")}.
                </small>
                {fieldError("miles")}
              </div>
            ) : (
              <fieldset className="store-fieldset">
                <legend>Term</legend>
                <RadioGroup
                  id={`${uid}-passPeriod`}
                  layout="horizontal"
                  value={draft.passPeriod}
                  aria-invalid={!!errors.passPeriod}
                  aria-describedby={errors.passPeriod ? `${uid}-passPeriod-error` : undefined}
                  onChange={(_, data) => patch({ passPeriod: data.value as StorePassPeriod }, ["passPeriod"])}
                >
                  {storePassPeriods.map((period) => (
                    <Radio key={period} value={period} label={termLabel(period)} />
                  ))}
                </RadioGroup>
                {fieldError("passPeriod")}
              </fieldset>
            )}
          </div>
        </fieldset>
        <div className="admin-actions">
          <Button type="submit" appearance="primary" disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Create product"}
          </Button>
          <Button disabled={busy} onClick={cancel}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  const confirming = panel?.type === "confirm" ? rowOf(panel.id) : undefined;
  const editing = panel?.type === "edit" ? rowOf(panel.id) : undefined;

  return (
    <div ref={rootRef}>
      <div className="admin-heading store-view-heading">
        <p>
          Products the game app can offer, as the game backend records them. Prices are set in App Store Connect and
          Google Play, not here; this website sells nothing.
        </p>
        <div className="admin-heading-actions">
          <Button data-opener="new" icon={<Plus />} disabled={locked || load === "loading"} onClick={openCreate}>
            New product
          </Button>
          <Button icon={<ArrowClockwise />} disabled={locked || load === "loading"} onClick={() => void reload()}>
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

      {panel?.type === "create" && <section className="admin-panel store-create">{form(undefined)}</section>}

      <section className="admin-panel admin-table-wrap" aria-labelledby={`${uid}-heading`} aria-busy={load === "loading"}>
        <div className="admin-panel-header">
          <div>
            <h2 id={`${uid}-heading`} ref={headingRef} tabIndex={-1}>
              Products
            </h2>
            <p>Sorted by product id</p>
          </div>
        </div>
        {load === "loading" ? (
          <div className="admin-empty">
            <b>Loading products…</b>
          </div>
        ) : rows.length ? (
          <div className="admin-table-scroll">
            <table className="admin-table store-table">
              <thead>
                <tr>
                  <th>Product id</th>
                  <th>Kind</th>
                  <th>Contents</th>
                  <th>
                    Staff label <small className="store-th-hint">internal, never shown to players</small>
                  </th>
                  <th>Status</th>
                  <th>Version</th>
                  <th>Updated</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const id = row.productId;
                  const retired = row.status === "retired";
                  const openConfirm_ = confirming?.productId === id && panel?.type === "confirm" ? panel.action : null;
                  const openEdit_ = editing?.productId === id;
                  return (
                    <Fragment key={id}>
                      <tr>
                        <td data-label="Product id">
                          <b className="store-id">{id}</b>
                          {row.demo && (
                            <>
                              <span className="status-badge store-badge">Placeholder</span>
                              <small>Placeholder store id: not sold in production</small>
                            </>
                          )}
                        </td>
                        <td data-label="Kind">{storeProductLabel(row.kind)}</td>
                        <td data-label="Contents">{contentsLabel(row)}</td>
                        <td data-label="Staff label">{row.title}</td>
                        <td data-label="Status">
                          <span className={`status-badge store-status ${retired ? "retired" : "active"}`}>
                            {retired ? "Retired" : "Active"}
                          </span>
                        </td>
                        <td data-label="Version">{row.version}</td>
                        <td data-label="Updated">{when(row.updatedAt)}</td>
                        <td className="store-actions">
                          <Button data-opener={`${id}|edit`} disabled={locked} onClick={() => openEdit(row)}>
                            Edit
                          </Button>
                          <Button
                            data-opener={`${id}|${retired ? "restore" : "retire"}`}
                            disabled={locked}
                            onClick={() => openConfirm(row, retired ? "restore" : "retire")}
                          >
                            {retired ? "Restore" : "Retire"}
                          </Button>
                        </td>
                      </tr>
                      {openEdit_ && (
                        <tr className="store-form-row">
                          <td colSpan={8}>{form(row)}</td>
                        </tr>
                      )}
                      {openConfirm_ && (
                        <tr className="store-confirm-row">
                          <td colSpan={8}>
                            <div
                              className="store-confirm"
                              role="group"
                              tabIndex={-1}
                              ref={confirmRef}
                              aria-label={
                                openConfirm_ === "retire"
                                  ? `Retire ${id}: the game stops offering it`
                                  : `Restore ${id}: the game can offer it again`
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Escape" && !busy) cancel();
                              }}
                            >
                              <p>
                                {openConfirm_ === "retire" ? (
                                  <>
                                    <b>Retire {id}?</b> The game stops offering it. Purchases already made are still honoured.
                                  </>
                                ) : (
                                  <>
                                    <b>Restore {id}?</b> The game can offer it again.
                                    {row.demo && " (A placeholder product is never offered in production.)"}
                                  </>
                                )}
                              </p>
                              <Button appearance="primary" disabled={busy} onClick={() => void confirmAction()}>
                                {busy ? "Saving…" : openConfirm_ === "retire" ? "Confirm retire" : "Confirm restore"}
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
          </div>
        ) : (
          <div className="admin-empty">
            <Storefront size={25} />
            <b>{load === "error" ? "The store catalog is unavailable" : "No products recorded yet"}</b>
          </div>
        )}
      </section>
      <p className="users-footnote">
        Kind and the placeholder flag are fixed when a product is created. Hint packs hold {storeHintsMin} to{" "}
        {storeHintsMax} hints and Miles packs hold {storeMilesMin} to {storeMilesMax.toLocaleString("en-US")} Miles. The staff label is for this workspace only.
      </p>
    </div>
  );
}

type View = "products" | "purchases" | "player";
const views: { view: View; label: string }[] = [
  { view: "products", label: "Products" },
  { view: "purchases", label: "Purchases" },
  { view: "player", label: "Player pass" },
];

/**
 * The Store desk: one heading and three views. Keyed on the account session, so nothing chosen under
 * one account (a pass lookup, filters, results) carries over to the next.
 */
export function StoreDesk(props: {
  sessionKey: string;
  /** The workspace's account fence: clears private data and reports the access change. */
  onBlocked: (status: number) => void;
}) {
  return <StoreShell key={props.sessionKey} {...props} />;
}

/** Views already opened stay mounted (hidden) so results survive a switch. */
function StoreShell({
  sessionKey,
  onBlocked,
}: {
  sessionKey: string;
  onBlocked: (status: number) => void;
}) {
  const [view, setView] = useState<View>("products");
  const [opened, setOpened] = useState<View[]>(["products"]);
  const [passRequest, setPassRequest] = useState<{ principal: string; nonce: number } | null>(null);
  const call = useCallback(
    (path: string, method?: string, json?: unknown) => callStore(sessionKey, path, method, json),
    [sessionKey],
  );

  function show(next: View) {
    setView(next);
    setOpened((old) => (old.includes(next) ? old : [...old, next]));
  }
  const viewPass = useCallback((principal: string) => {
    setPassRequest((old) => ({ principal, nonce: (old?.nonce ?? 0) + 1 }));
    setView("player");
    setOpened((old) => (old.includes("player") ? old : [...old, "player"]));
  }, []);

  return (
    <div>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">MONETIZATION</p>
          <h1>Store</h1>
        </div>
      </div>
      <div className="users-views" role="group" aria-label="Store views">
        {views.map((v) => (
          <button
            key={v.view}
            type="button"
            aria-pressed={view === v.view}
            className={`users-view ${view === v.view ? "active" : ""}`}
            onClick={() => show(v.view)}
          >
            {v.label}
          </button>
        ))}
      </div>
      {opened.includes("products") && (
        <div hidden={view !== "products"}>
          <ProductsView key={sessionKey} sessionKey={sessionKey} onBlocked={onBlocked} />
        </div>
      )}
      {opened.includes("purchases") && (
        <div hidden={view !== "purchases"}>
          <StorePurchases key={sessionKey} call={call} onBlocked={onBlocked} onViewPass={viewPass} />
        </div>
      )}
      {opened.includes("player") && (
        <div hidden={view !== "player"}>
          <StorePlayer key={sessionKey} call={call} onBlocked={onBlocked} request={passRequest} />
        </div>
      )}
    </div>
  );
}
