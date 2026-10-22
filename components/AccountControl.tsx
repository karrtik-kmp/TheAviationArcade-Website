"use client";

import { usePathname } from "next/navigation";
import {
  ArrowClockwise,
  UserCircle,
  SignOut,
  IdentificationCard,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  accountSignInPath,
  accountSignOutPath,
  contributorPath,
  safeAccountReturn,
} from "@/lib/account";
import { useAccountSession } from "@/components/AccountSession";
import { SiteLink } from "@/components/SiteLink";

function currentReturn(pathname: string) {
  if (typeof window === "undefined") return safeAccountReturn(pathname);
  return safeAccountReturn(
    window.location.pathname + window.location.search + window.location.hash,
  );
}

export function AccountControl() {
  const pathname = usePathname() || "/";
  const { state, account, refresh } = useAccountSession();
  const [open, setOpen] = useState(false);
  const [returnTo, setReturnTo] = useState(safeAccountReturn(pathname));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (
        !menuRef.current?.contains(event.target as Node) &&
        !triggerRef.current?.contains(event.target as Node)
      )
        close();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close]);

  useEffect(() => close(), [pathname, close]);
  useEffect(() => close(), [state, account?.sessionKey, close]);
  useEffect(() => setReturnTo(currentReturn(pathname)), [pathname]);

  if (state === "loading") {
    return (
      <span
        className="account-control account-status"
        role="status"
        aria-label="Checking account"
      >
        <span className="account-status-dot" />
        Checking…
      </span>
    );
  }
  if (state === "error") {
    return (
      <div className="account-control account-error" role="status">
        <span>Account unavailable</span>
        <button type="button" onClick={() => void refresh()}>
          <ArrowClockwise size={15} /> Retry
        </button>
      </div>
    );
  }
  if (!account?.user) {
    return (
      <SiteLink
        className="account-signin"
        href={accountSignInPath(returnTo)}
        target="_top"
      >
        <UserCircle size={19} /> <span>Sign in</span>
      </SiteLink>
    );
  }

  return (
    <div className="account-control account-menu-wrap">
      <button
        ref={triggerRef}
        className="account-trigger"
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <UserCircle size={20} weight="regular" />
        <span className="account-trigger-name">{account.user.displayName}</span>
        <span className="account-trigger-caret" aria-hidden="true">
          ⌄
        </span>
      </button>
      {open && (
        <nav
          className="account-menu"
          id="account-menu"
          ref={menuRef}
          aria-label="Account menu"
        >
          <div className="account-menu-heading">
            <span className="eyebrow">Signed in as</span>
            <strong>{account.user.displayName}</strong>
          </div>
          <SiteLink href="/account" onClick={() => close()}>
            <IdentificationCard size={18} /> My account
          </SiteLink>
          <SiteLink
            href={contributorPath(undefined, undefined, "mine")}
            onClick={() => close()}
          >
            My submissions
          </SiteLink>
          {account.isStaff && (
            <SiteLink href="/admin" onClick={() => close()}>
              Editorial workspace
            </SiteLink>
          )}
          <a
            className="account-menu-signout"
            href={accountSignOutPath()}
            target="_top"
          >
            <SignOut size={18} /> Sign out
          </a>
        </nav>
      )}
    </div>
  );
}
