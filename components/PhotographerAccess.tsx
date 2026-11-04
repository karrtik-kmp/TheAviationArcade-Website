"use client";

import { Camera } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { SiteLink } from "@/components/SiteLink";
import { accountHeaders } from "@/lib/account";
import { sitePath } from "@/lib/paths";
import type { OwnRole, RoleSnapshot } from "@/lib/request/roles";
import "./contribute.css";

/**
 * Shown on /contribute to a signed-in account that is not an approved photographer. Asking
 * records a request on the game backend; an admin approves it in Users and roles. Nothing here
 * grants access: the server reads the role again before accepting any photo. While roles are
 * mocked from the deployment's env lists, there is nothing to request.
 */
export function PhotographerAccess({
  row: initialRow,
  status,
  mock,
  emailVerified,
  sessionKey,
}: {
  /** The account's photographer role row, or null when it never asked. */
  row: OwnRole | null;
  status: RoleSnapshot["status"];
  /** Roles are set by this deployment, not requested. */
  mock: boolean;
  emailVerified: boolean;
  sessionKey: string;
}) {
  const [row, setRow] = useState(initialRow);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestedOn, setRequestedOn] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const announce = useRef(false);

  // Formatted after mount, so the server's and the browser's locale can't disagree.
  useEffect(() => {
    const date = row ? new Date(row.requestedAt) : null;
    setRequestedOn(
      date && !Number.isNaN(date.valueOf())
        ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)
        : "",
    );
    if (announce.current) {
      announce.current = false;
      headingRef.current?.focus();
    }
  }, [row]);

  async function ask() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(sitePath("/api/me/roles/photographer"), {
        method: "POST",
        headers: accountHeaders(sessionKey),
      });
      const body = (await response.json().catch(() => ({}))) as { role?: OwnRole; error?: string };
      if (response.ok && body.role) {
        announce.current = true;
        setRow(body.role);
      } else setError(body.error ?? "Your request could not be sent. Please try again.");
    } catch {
      setError("Your request could not be sent. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  let title: string;
  let text: string;
  let canAsk = false;
  if (mock) {
    title = "Photographer access is set up by the team";
    text =
      "On this preview, photographer accounts are added by the Airplane Games team. If you have been invited, sign in with the email address you were invited with.";
  } else if (status === "not-connected") {
    title = "Photographer access isn't open yet";
    text = "Requests for photographer access aren't open on this website yet.";
  } else if (status !== "ok") {
    title = "Photographer access can't be checked";
    text = "We couldn't reach the service that records photographer access. Please try again in a moment.";
  } else if (row?.state === "blocked") {
    title = "Photographer access isn't available";
    text = "This account can't ask for photographer access.";
  } else if (row?.state === "active") {
    title = "Verify your email address";
    text = "Your photographer access is approved, but photos can only be sent from a verified email address.";
  } else if (row?.state === "pending") {
    title = "Your request is awaiting approval";
    text =
      "Thanks for offering your photographs. The Airplane Games team will review your request, and the photo form opens here once it is approved.";
  } else if (row?.state === "rejected") {
    title = "Your request wasn't approved";
    text = "Your earlier request for photographer access was turned down. You can ask again, and it will be reviewed.";
    canAsk = true;
  } else if (row?.state === "revoked") {
    title = "Your photographer access was removed";
    text = "This account can no longer send photos. You can ask for access again, and it will be reviewed.";
    canAsk = true;
  } else {
    title = "Become an approved photographer";
    text =
      "Photos are accepted from approved photographers. Ask for access, and the Airplane Games team will review your request before the photo form opens.";
    canAsk = true;
  }
  const needsVerification = !mock && status === "ok" && (canAsk || row?.state === "active") && !emailVerified;

  return (
    <main id="main" className="wrap contribute-root">
      <section className="page-intro">
        <p className="eyebrow">COMMUNITY PHOTOGRAPHY</p>
        <h1>Bring your view of aviation.</h1>
      </section>
      <section className="signin-panel photographer-access" aria-labelledby="photographer-access-title">
        <Camera size={28} weight="duotone" aria-hidden="true" />
        <h2 id="photographer-access-title" ref={headingRef} tabIndex={-1}>
          {title}
        </h2>
        <p>{text}</p>
        {!mock && row?.state === "pending" && requestedOn && (
          <p className="photographer-access-meta">
            Requested <time dateTime={row.requestedAt}>{requestedOn}</time>
          </p>
        )}
        {error && (
          <p className="photographer-access-error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          {canAsk && emailVerified && !mock && status === "ok" && (
            <button className="btn" type="button" disabled={busy} onClick={() => void ask()}>
              {busy ? "Sending request…" : row ? "Ask again" : "Request photographer access"}
            </button>
          )}
          {needsVerification && (
            <>
              <p className="photographer-access-meta">
                Verify your email address first. A verification link can be sent from your account page.
              </p>
              <SiteLink className="btn" href="/account">
                Go to your account page
              </SiteLink>
            </>
          )}
          {status === "unavailable" && (
            <button className="btn secondary" type="button" onClick={() => window.location.reload()}>
              Try again
            </button>
          )}
          <SiteLink className="btn secondary" href="/contribute?view=mine">
            Your earlier submissions
          </SiteLink>
        </div>
      </section>
    </main>
  );
}
