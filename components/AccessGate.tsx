"use client";

import type { ReactNode } from "react";
import { accountSignOutPath } from "@/lib/account";
import { SiteLink } from "@/components/SiteLink";

/** The account actions every access and session gate offers, in one order. */
export function AccountActions({
  signInHref,
  onRetry,
  reloadLabel,
  className = "admin-gate-actions",
}: {
  /** App path of the sign-in page; omit when signing in again wouldn't help. */
  signInHref?: string | null;
  onRetry?: () => void;
  /** Shows a reload button with this label. */
  reloadLabel?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {onRetry && (
        <button className="btn secondary" type="button" onClick={onRetry}>
          Retry account check
        </button>
      )}
      {signInHref && (
        <SiteLink className="btn" href={signInHref} target="_top">
          Sign in
        </SiteLink>
      )}
      <SiteLink className="btn secondary" href="/account">
        Account options
      </SiteLink>
      <SiteLink
        className="btn secondary"
        href={accountSignOutPath()}
        target="_top"
      >
        Sign out
      </SiteLink>
      {reloadLabel && (
        <button
          className="btn secondary"
          type="button"
          onClick={() => window.location.reload()}
        >
          {reloadLabel}
        </button>
      )}
    </div>
  );
}

/** A centred card shown in place of an area the visitor can't use yet. */
export function AccessGate({
  eyebrow = "Airplane Games",
  title,
  children,
  actions,
  alert = false,
}: {
  eyebrow?: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  alert?: boolean;
}) {
  return (
    <main id="main" className="admin-gate">
      <div className="admin-gate-card" role={alert ? "alert" : undefined}>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {children}
        {actions}
      </div>
    </main>
  );
}
