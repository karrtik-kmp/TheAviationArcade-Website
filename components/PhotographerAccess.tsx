"use client";

import { Camera } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { SiteLink } from "@/components/SiteLink";
import { accountHeaders, accountSignInPath } from "@/lib/account";
import { sitePath } from "@/lib/paths";
import type { OwnRole, RoleSnapshot } from "@/lib/request/roles";
import "./contribute.css";

/**
 * Shown on /contribute to a signed-in account that can't send photos yet. Since API 0.32.0 (user ruling
 * 2026-11-26) any registered account with a verified email may send photos with no approval: a verified,
 * unblocked account turns photo submission on by itself here (the server issues the role at its one fixed
 * route), then the page reloads into the photo form. The team still reviews every photo before anything
 * is published. Nothing here grants access: the server reads the role again before accepting any photo.
 * While roles are mocked from the deployment's env lists, there is nothing to turn on.
 */
export function PhotographerAccess({
  row,
  status,
  mock,
  emailVerified,
  sessionKey,
  hideEarlier = false,
}: {
  /** The account's photographer role row, or null when it never had one. */
  row: OwnRole | null;
  status: RoleSnapshot["status"];
  /** Roles are set by this deployment, not turned on by the account. */
  mock: boolean;
  emailVerified: boolean;
  sessionKey: string;
  /** Backend media mode: the earlier website proposals are closed, so don't link to them. */
  hideEarlier?: boolean;
}) {
  const canStart = !mock && status === "ok" && emailVerified && row?.state !== "blocked";
  const [busy, setBusy] = useState(canStart);
  const [error, setError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const started = useRef(false);

  async function turnOn() {
    try {
      const response = await fetch(sitePath("/api/me/roles/photographer"), {
        method: "POST",
        headers: accountHeaders(sessionKey),
      });
      const body = (await response.json().catch(() => ({}))) as { role?: OwnRole; error?: string };
      if (response.ok && body.role?.state === "active") {
        // The server renders the photo form once it reads the active role.
        window.location.reload();
        return;
      }
      setError(body.error ?? "Photo submission couldn't be turned on. Please try again.");
    } catch {
      setError("Photo submission couldn't be turned on. Check your connection and try again.");
    }
    setBusy(false);
    headingRef.current?.focus();
  }

  // Turn submission on once when the page opens (a repeat is harmless: the server answers "already on").
  useEffect(() => {
    if (!canStart || started.current) return;
    started.current = true;
    void turnOn();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, []);

  let title: string;
  let text: string;
  if (mock) {
    title = "Photographer access is set up by the team";
    text =
      "On this preview, photographer accounts are added by the Airplane Games team. If you have been invited, sign in with the email address you were invited with.";
  } else if (status === "not-connected") {
    title = "Photo submissions aren't open yet";
    text = "Photo submissions open here once the Airplane Games photo service is connected.";
  } else if (status !== "ok") {
    title = "We can't check your account right now";
    text = "We couldn't reach the Airplane Games photo service. Please try again in a moment.";
  } else if (row?.state === "blocked") {
    title = "Photo submission isn't available";
    text = "This account can't send photos.";
  } else if (!emailVerified) {
    title = "Verify your email address";
    text =
      "Any registered account can send photos once its email address is verified. A verification link can be sent from your account page.";
  } else if (error) {
    title = "We couldn't open the photo form";
    text = error;
  } else {
    title = "Opening the photo form";
    text = "Setting up photo submission for your account…";
  }

  return (
    <main id="main" className="wrap contribute-root">
      <section className="page-intro">
        <p className="eyebrow">Calling all aviation photographers</p>
        <h1>Your Best Shot Deserves Some Air Time.</h1>
      </section>
      <section
        className="signin-panel photographer-access"
        aria-labelledby="photographer-access-title"
        aria-busy={busy || undefined}
      >
        <Camera size={28} weight="duotone" aria-hidden="true" />
        <h2 id="photographer-access-title" ref={headingRef} tabIndex={-1}>
          {title}
        </h2>
        <p role={canStart ? (error ? "alert" : "status") : undefined}>{text}</p>
        <div className="actions">
          {canStart && error && !busy && (
            <button
              className="btn"
              type="button"
              onClick={() => {
                setBusy(true);
                setError("");
                void turnOn();
              }}
            >
              Try again
            </button>
          )}
          {!mock && status === "ok" && row?.state !== "blocked" && !emailVerified && (
            <SiteLink className="btn" href="/account">
              Go to your account page
            </SiteLink>
          )}
          {status === "unavailable" && (
            <button className="btn secondary" type="button" onClick={() => window.location.reload()}>
              Try again
            </button>
          )}
          {!hideEarlier && (
            <SiteLink className="btn secondary" href="/contribute?view=mine">
              Your earlier submissions
            </SiteLink>
          )}
        </div>
      </section>
    </main>
  );
}

/** The client's welcome for visitors who are not signed in (website notes 1, 2026-11). */
function PhotographerWelcome() {
  return (
    <div className="photographer-welcome">
      <p className="page-subheading">You know the feeling.</p>
      <p>
        The light is perfect. The aircraft is perfectly positioned. You press the shutter and capture a moment that
        makes you smile.
      </p>
      <p>We love those moments too!</p>
      <p>
        Airplane Games is building a growing collection of aviation photography, featuring aircraft, airports, airline
        tails, and the incredible world of flight.
      </p>
      <p>
        Whether you&apos;re a dedicated plane spotter or just happened to capture something amazing, we&apos;d love to
        see your work.
      </p>
      <h2>Share Your View From the Flight Line.</h2>
      <p>Your photography may be considered for our Plane of the Day feature, aviation galleries, or future game content.</p>
      <p>
        We believe photographers deserve recognition for their work, and approved featured images will include
        appropriate credit.
      </p>
      <h2>Ready to Share?</h2>
      <p>
        Sign in to submit your photography for review. We&apos;ll review submissions for image quality, accuracy, and
        appropriate usage rights before publication.
      </p>
    </div>
  );
}

/**
 * /contribute when photographer submissions are not open through the website: the website's own
 * proposal routes are closed to members (D-2 amended), and backend media needs the photo service.
 * A guest with `signInRequired` is asked to sign in instead (backend mode).
 */
export function SubmissionsClosed({ signedIn, signInRequired = false }: { signedIn: boolean; signInRequired?: boolean }) {
  const guest = signInRequired && !signedIn;
  return (
    <main id="main" className="wrap contribute-root">
      <section className="page-intro">
        <p className="eyebrow">Calling all aviation photographers</p>
        <h1>Your Best Shot Deserves Some Air Time.</h1>
        {guest && <PhotographerWelcome />}
      </section>
      <section className="signin-panel photographer-access" aria-labelledby="submissions-closed-title">
        <Camera size={28} weight="duotone" aria-hidden="true" />
        <h2 id="submissions-closed-title">{signInRequired ? "Sign in to continue" : "Photo submissions aren't open yet"}</h2>
        <p>
          {signInRequired
            ? "Sign in to send your photos."
            : "Photo submissions open here once the Airplane Games photo service is connected."}
        </p>
        {guest && (
          <div className="actions">
            <SiteLink className="btn" href={accountSignInPath("/contribute")}>
              Sign In to Submit Photos
            </SiteLink>
          </div>
        )}
      </section>
    </main>
  );
}
