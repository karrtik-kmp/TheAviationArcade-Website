"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwise, SignOut } from "@phosphor-icons/react";
import { logoutFirebase } from "@/lib/firebase-client";
import { navigateTo } from "@/lib/paths";
import { SiteLink } from "@/components/SiteLink";

export function SignOutPage() {
  const [state, setState] = useState<"working" | "error">("working");
  const attempt = useRef<Promise<void> | null>(null);
  const run = useCallback(async () => {
    setState("working");
    try {
      if (!attempt.current) attempt.current = logoutFirebase();
      await attempt.current;
      navigateTo("/account?signed_out=1", { replace: true });
    } catch {
      attempt.current = null;
      setState("error");
    }
  }, []);
  useEffect(() => {
    void run();
  }, [run]);
  return (
    <main id="main" className="auth-page">
      <section className="auth-card signout-card" aria-live="polite">
        {state === "working" ? (
          <>
            <span className="account-status-dot" />
            <h1>Signing out</h1>
            <p>We’re clearing your account session.</p>
          </>
        ) : (
          <>
            <SignOut size={30} className="auth-signout-icon" />
            <h1>We couldn’t sign you out</h1>
            <p>
              Your account may still be active in this browser. Try again to
              clear the session.
            </p>
            <button className="btn" type="button" onClick={() => void run()}>
              <ArrowClockwise size={17} /> Try again
            </button>
            <SiteLink className="auth-back-link" href="/account">
              Return to my account
            </SiteLink>
          </>
        )}
      </section>
    </main>
  );
}
