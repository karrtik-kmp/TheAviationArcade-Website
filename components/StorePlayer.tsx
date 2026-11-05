"use client";

import { Button, Input, MessageBar, MessageBarBody } from "@fluentui/react-components";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { StaffEntitlements } from "@/lib/request/store";
import { blockStatusOf } from "@/lib/store-form";
import {
  readFailureText,
  storeNameLabel,
  subscriptionReference,
  subscriptionStateLabel,
  whenLabel,
  type Reply,
} from "@/lib/store-view";

/**
 * One player's First Class Pass and store subscriptions (openapi 0.21.0): read only, staff only. A
 * player is found by Firebase UID or full principal, never by email or display name. Only the newest
 * lookup may write the result.
 */

type Notice = { kind: "error" | "success"; text: string } | null;
type Call = (path: string, method?: string, json?: unknown) => Promise<Reply>;

function parseEntitlements(reply: Reply): StaffEntitlements | null {
  const { body } = reply;
  if (reply.status !== 200 || typeof body.principal !== "string" || typeof body.firstClassPass !== "boolean") return null;
  if (!Array.isArray(body.subscriptions)) return null;
  return body as unknown as StaffEntitlements;
}

export function StorePlayer({
  call,
  onBlocked,
  request,
}: {
  call: Call;
  /** The workspace's account fence: clears private data and reports the access change. */
  onBlocked: (status: number) => void;
  /** A lookup opened from elsewhere (a purchase row); a new `nonce` runs it again. */
  request: { principal: string; nonce: number } | null;
}) {
  const uid = useId().replace(/:/g, "");
  const [text, setText] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [result, setResult] = useState<StaffEntitlements | null>(null);
  const [load, setLoad] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [notice, setNotice] = useState<Notice>(null);
  const generation = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusAfter = useRef<"notice" | "heading" | null>(null);
  const lookup = useCallback(async (raw: string) => {
    const value = raw.trim();
    if (!value) {
      setFieldError("Enter a Firebase UID or the full player id.");
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    setFieldError("");
    const mine = ++generation.current;
    setLoad("loading");
    setNotice(null);
    const reply = await call(`/api/admin/store/players/${encodeURIComponent(value)}/entitlements`);
    if (mine !== generation.current) return;
    const blocked = blockStatusOf(reply.status, reply.code);
    if (blocked !== null) {
      onBlocked(blocked);
      return;
    }
    const found = parseEntitlements(reply);
    if (found) {
      setResult(found);
      setLoad("ready");
      focusAfter.current = "heading";
      return;
    }
    setResult(null);
    setLoad("error");
    focusAfter.current = "notice";
    setNotice({
      kind: "error",
      text:
        reply.code === "PLAYER_NOT_FOUND"
          ? "No player with that id (or the account was deleted)."
          : readFailureText(reply, "The player's pass could not be loaded."),
    });
  }, [call, onBlocked]);

  // A lookup requested from the Purchases view. Unmounting drops any answer in flight and forgets the
  // request seen, so a remount (StrictMode included) runs it again rather than waiting forever.
  const lastNonce = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
      lastNonce.current = 0;
    },
    [],
  );
  useEffect(() => {
    if (!request || request.nonce === lastNonce.current) return;
    lastNonce.current = request.nonce;
    setText(request.principal);
    void lookup(request.principal);
  }, [request, lookup]);

  useEffect(() => {
    if (load === "loading" || !focusAfter.current) return;
    const target = focusAfter.current === "notice" && noticeRef.current ? noticeRef.current : headingRef.current;
    focusAfter.current = null;
    target?.focus();
  }, [load, notice]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (load === "loading") return;
    void lookup(text);
  }

  const inputId = `${uid}-player`;
  return (
    <div>
      <p className="store-view-intro">
        One player&apos;s First Class Pass and store subscriptions, as the game backend records them. Staff only;
        nothing here can be changed.
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
          <button className="admin-message-close" aria-label="Dismiss" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}

      <section className="admin-panel store-create">
        <form className="store-form" noValidate aria-label="Look up a player" onSubmit={submit}>
          <div className="admin-field">
            <label htmlFor={inputId}>
              <span>Player</span>
            </label>
            <Input
              id={inputId}
              ref={inputRef}
              value={text}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!!fieldError}
              aria-describedby={`${inputId}-hint${fieldError ? ` ${inputId}-error` : ""}`}
              onChange={(_, data) => {
                setText(data.value);
                setFieldError("");
              }}
            />
            <small className="field-hint" id={`${inputId}-hint`}>
              A Firebase UID, or the full id (firebase:project:uid). Email addresses and display names are not searched.
            </small>
            {fieldError && (
              <span className="store-error" id={`${inputId}-error`}>
                {fieldError}
              </span>
            )}
          </div>
          <div className="admin-actions">
            <Button type="submit" appearance="primary" disabled={load === "loading"}>
              {load === "loading" ? "Looking up…" : "Look up"}
            </Button>
          </div>
        </form>
      </section>

      <section className="admin-panel store-player-result" aria-labelledby={`${uid}-heading`} aria-busy={load === "loading"}>
        <div className="admin-panel-header">
          <div>
            <h2 id={`${uid}-heading`} ref={headingRef} tabIndex={-1}>
              Player pass
            </h2>
            {result && load !== "loading" && <p>as of {whenLabel(result.evaluatedAt)}</p>}
          </div>
        </div>
        {load === "loading" ? (
          <div className="admin-empty">
            <b>Looking up…</b>
          </div>
        ) : result ? (
          <>
            <dl className="store-facts store-player-facts">
              <div>
                <dt>Player</dt>
                <dd className="store-id">{result.principal}</dd>
              </div>
              <div>
                <dt>First Class Pass</dt>
                <dd>
                  <span className={`status-badge store-status ${result.firstClassPass ? "active" : "retired"}`}>
                    {result.firstClassPass ? "Active" : "Not active"}
                  </span>{" "}
                  <small>as of {whenLabel(result.evaluatedAt)}</small>
                </dd>
              </div>
              <div>
                <dt>Pass until</dt>
                <dd>{result.firstClassUntil ? whenLabel(result.firstClassUntil) : "—"}</dd>
              </div>
              <div>
                <dt>Pass product</dt>
                <dd className="store-id">{result.productId ?? "—"}</dd>
              </div>
              <div>
                <dt>Store account created</dt>
                <dd>{result.hasStoreAccount ? "Yes" : "No"}</dd>
              </div>
            </dl>
            <h3 className="store-subs-title">Subscriptions</h3>
            {result.subscriptions.length ? (
              <div className="admin-table-scroll">
                <table className="admin-table store-table">
                  <thead>
                    <tr>
                      <th>Store</th>
                      <th>Product id</th>
                      <th>Status</th>
                      <th>Expires</th>
                      <th>Last event</th>
                      <th>Original reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.subscriptions.map((sub) => (
                      <tr key={`${sub.store}|${sub.originalTransactionId ?? sub.originalFingerprint ?? sub.productId}`}>
                        <td data-label="Store">{storeNameLabel(sub.store)}</td>
                        <td data-label="Product id">
                          <b className="store-id">{sub.productId}</b>
                        </td>
                        <td data-label="Status">{subscriptionStateLabel(sub, result.evaluatedAt)}</td>
                        <td data-label="Expires">{whenLabel(sub.expiresAt)}</td>
                        <td data-label="Last event">{whenLabel(sub.lastEventAt)}</td>
                        <td data-label="Original reference">
                          <span className="store-ref">{subscriptionReference(sub)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="store-view-intro">No store subscriptions recorded.</p>
            )}
          </>
        ) : (
          <div className="admin-empty">
            <b>{load === "error" ? "No pass to show" : "Look up a player to see their pass"}</b>
          </div>
        )}
      </section>
    </div>
  );
}
