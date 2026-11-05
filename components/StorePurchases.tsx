"use client";

import { Button, Input, MessageBar, MessageBarBody, Radio, RadioGroup } from "@fluentui/react-components";
import { Receipt } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { StaffStorePurchase } from "@/lib/request/store";
import { blockStatusOf } from "@/lib/store-form";
import {
  emptyFilters,
  environmentBadge,
  filtersEmpty,
  filtersToBody,
  grantLabel,
  kindLabel,
  readFailureText,
  referenceLines,
  storeNameLabel,
  viewPassPrincipal,
  whenLabel,
  type PurchaseFilters,
  type Reply,
} from "@/lib/store-view";

/**
 * Store purchases (openapi 0.21.0): the purchase records the game backend holds, newest first. Read only,
 * staff only. The search goes out as a POST body so a Google purchase token never sits in a URL. Load
 * more always uses the filters of the last Search, never what is typed in the form since.
 */

type Notice = { kind: "error" | "success"; text: string } | null;
type Call = (path: string, method?: string, json?: unknown) => Promise<Reply>;
const searchPath = "/api/admin/store/purchases/search";

function parsePage(reply: Reply): { purchases: StaffStorePurchase[]; nextCursor: string | null } | null {
  const { purchases, nextCursor } = reply.body;
  if (reply.status !== 200 || !Array.isArray(purchases)) return null;
  return {
    purchases: purchases as StaffStorePurchase[],
    nextCursor: typeof nextCursor === "string" && nextCursor ? nextCursor : null,
  };
}

export function StorePurchases({
  call,
  onBlocked,
  onViewPass,
}: {
  call: Call;
  /** The workspace's account fence: clears private data and reports the access change. */
  onBlocked: (status: number) => void;
  onViewPass: (principal: string) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const [form, setForm] = useState<PurchaseFilters>(emptyFilters);
  // The filters of the last Search: what Load more and Start again use.
  const [applied, setApplied] = useState<PurchaseFilters>(emptyFilters);
  const [rows, setRows] = useState<StaffStorePurchase[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [load, setLoad] = useState<"loading" | "more" | "ready" | "error">("loading");
  const [notice, setNotice] = useState<Notice>(null);
  const [stale, setStale] = useState(false);
  // Only the newest request may write the list; bumped on unmount too.
  const generation = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const focusAfter = useRef<"notice" | "heading" | null>(null);

  const run = useCallback(
    /** `byUser`: a Search, Clear or Start again moves focus to the results; the first load doesn't. */
    async (filters: PurchaseFilters, cursor: string | null, byUser = true) => {
      const mine = ++generation.current;
      setLoad(cursor ? "more" : "loading");
      setNotice(null);
      setStale(false);
      const reply = await call(searchPath, "POST", filtersToBody(filters, cursor));
      if (mine !== generation.current) return;
      const blocked = blockStatusOf(reply.status, reply.code);
      if (blocked !== null) {
        onBlocked(blocked);
        return;
      }
      focusAfter.current = "notice";
      if (reply.code === "CURSOR_STALE") {
        // Keep what is shown; the admin chooses when to start again.
        setLoad("ready");
        setNextCursor(null); // the same cursor would only fail again
        setStale(true);
        setNotice({ kind: "error", text: "That page no longer matches this search. Start again from the first page." });
        return;
      }
      const page = parsePage(reply);
      if (!page) {
        if (!cursor) {
          setRows([]);
          setNextCursor(null);
        }
        setLoad("error");
        setNotice({ kind: "error", text: readFailureText(reply, "The purchases could not be loaded.") });
        return;
      }
      setRows((old) => {
        if (!cursor) return page.purchases;
        const seen = new Set(old.map((row) => row.id));
        return [...old, ...page.purchases.filter((row) => !seen.has(row.id))];
      });
      setNextCursor(page.nextCursor);
      setLoad("ready");
      focusAfter.current = cursor || !byUser ? null : "heading";
    },
    [call, onBlocked],
  );

  useEffect(() => {
    // The first page loads after this render rather than setting state inside the effect body.
    let live = true;
    void Promise.resolve().then(() => {
      if (live) void run(emptyFilters(), null, false);
    });
    return () => {
      live = false;
      generation.current += 1;
    };
  }, [run]);

  useEffect(() => {
    if (load === "loading" || load === "more" || !focusAfter.current) return;
    const target = focusAfter.current === "notice" && noticeRef.current ? noticeRef.current : headingRef.current;
    focusAfter.current = null;
    target?.focus();
  }, [load, notice]);

  function search(event: FormEvent) {
    event.preventDefault();
    if (load === "loading" || load === "more") return;
    const snapshot = { ...form };
    setApplied(snapshot);
    void run(snapshot, null);
  }
  function clear() {
    if (load === "loading" || load === "more") return;
    const blank = emptyFilters();
    setForm(blank);
    setApplied(blank);
    void run(blank, null);
  }
  function viewPass(principal: string) {
    const target = viewPassPrincipal(principal);
    if (!target) {
      focusAfter.current = "notice";
      setNotice({ kind: "error", text: "That player id can't be opened in Player pass." });
      return;
    }
    onViewPass(target);
  }

  const busy = load === "loading" || load === "more";
  const set = (change: Partial<PurchaseFilters>) => setForm((old) => ({ ...old, ...change }));
  const textField = (key: "player" | "productId" | "transactionRef" | "orderId", label: string, hint: string) => (
    <div className="admin-field">
      <label htmlFor={`${uid}-${key}`}>
        <span>{label}</span>
      </label>
      <Input
        id={`${uid}-${key}`}
        value={form[key]}
        autoComplete="off"
        spellCheck={false}
        aria-describedby={`${uid}-${key}-hint`}
        onChange={(_, data) => set({ [key]: data.value })}
      />
      <small className="field-hint" id={`${uid}-${key}-hint`}>
        {hint}
      </small>
    </div>
  );

  return (
    <div>
      <p className="store-view-intro">
        Purchase records from the game backend, newest first. Staff only; nothing here can be changed. A Sandbox
        badge marks a store test purchase: it still granted its contents to the player. Unbadged rows are real
        purchases.
      </p>

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
          {stale && (
            <Button className="store-start-again" onClick={() => void run(applied, null)}>
              Start again
            </Button>
          )}
          <button className="admin-message-close" aria-label="Dismiss" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}

      <section className="admin-panel store-create">
        <form className="store-form" noValidate aria-label="Find purchases" onSubmit={search}>
          <fieldset className="admin-fieldset" disabled={load === "loading"}>
            <div className="form-grid">
              {textField("player", "Player", "A Firebase UID, or the full id (firebase:project:uid). Email addresses are not searched.")}
              {textField("productId", "Product id", "Exact store product id.")}
              {textField("transactionRef", "Transaction reference", "Apple transaction id, or a Google purchase token.")}
              {textField("orderId", "Order id", "The store's order id.")}
              <fieldset className="store-fieldset">
                <legend>Store</legend>
                <RadioGroup
                  layout="horizontal"
                  value={form.store || "any"}
                  onChange={(_, data) => set({ store: data.value === "any" ? "" : (data.value as "apple" | "google") })}
                >
                  <Radio value="any" label="Any" />
                  <Radio value="apple" label="Apple" />
                  <Radio value="google" label="Google" />
                </RadioGroup>
              </fieldset>
            </div>
          </fieldset>
          <div className="admin-actions">
            <Button type="submit" appearance="primary" disabled={busy}>
              {load === "loading" ? "Searching…" : "Search"}
            </Button>
            <Button disabled={busy || (filtersEmpty(form) && filtersEmpty(applied))} onClick={clear}>
              Clear
            </Button>
          </div>
        </form>
      </section>

      <section className="admin-panel admin-table-wrap" aria-labelledby={`${uid}-heading`} aria-busy={load === "loading"}>
        <div className="admin-panel-header">
          <div>
            <h2 id={`${uid}-heading`} ref={headingRef} tabIndex={-1}>
              Purchases
            </h2>
            <p>
              Newest first{filtersEmpty(applied) ? "" : " · filtered"}
              {rows.length ? ` · ${rows.length} shown` : ""}
            </p>
          </div>
        </div>
        {load === "loading" ? (
          <div className="admin-empty">
            <b>Loading purchases…</b>
          </div>
        ) : rows.length ? (
          <>
            <div className="admin-table-scroll">
              <table className="admin-table store-table">
                <thead>
                  <tr>
                    <th>Purchased</th>
                    <th>Player</th>
                    <th>Product id</th>
                    <th>Grant</th>
                    <th>Store</th>
                    <th>References</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const badge = environmentBadge(row.environment);
                    return (
                      <tr key={row.id}>
                        <td data-label="Purchased">{whenLabel(row.purchasedAt)}</td>
                        <td data-label="Player">
                          <span className="store-id">{row.principal}</span>
                          <Button
                            size="small"
                            className="store-view-pass"
                            aria-label={`View pass for ${row.principal}`}
                            onClick={() => viewPass(row.principal)}
                          >
                            View pass
                          </Button>
                        </td>
                        <td data-label="Product id">
                          <b className="store-id">{row.productId}</b>
                          <small>{kindLabel(row.kind)}</small>
                        </td>
                        <td data-label="Grant">{grantLabel(row.grant)}</td>
                        <td data-label="Store">
                          {storeNameLabel(row.store)}
                          {badge && <span className="status-badge store-badge">{badge}</span>}
                        </td>
                        <td data-label="References">
                          {referenceLines(row).map((line) => (
                            <span className="store-ref" key={line}>
                              {line}
                            </span>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {nextCursor && (
              <div className="admin-actions store-more">
                <Button disabled={busy} onClick={() => void run(applied, nextCursor)}>
                  {load === "more" ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="admin-empty">
            <Receipt size={25} />
            <b>{load === "error" ? "The purchases are unavailable" : "No purchases match."}</b>
          </div>
        )}
      </section>
    </div>
  );
}
