"use client";

import {
  ArrowClockwise,
  ArrowRight,
  EnvelopeSimple,
  SignOut,
  UserCircle,
} from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  accountSignInPath,
  accountSignOutPath,
  audiences,
  safeAccountReturn,
} from "@/lib/account";
import {
  currentReturnPath,
  useAccountSession,
} from "@/components/AccountSession";
import { SiteLink } from "@/components/SiteLink";
import { getFirebaseClient, syncFirebaseSession } from "@/lib/firebase-client";
import { sendEmailVerification } from "firebase/auth";

type AccountPageProps = {
  signedOutReturn?: boolean;
  verificationNotice?: boolean;
  verificationSendFailed?: boolean;
  returnTo?: string;
};

export function AccountPage({
  signedOutReturn = false,
  verificationNotice = false,
  verificationSendFailed = false,
  returnTo = "/account",
}: AccountPageProps) {
  const pathname = usePathname() || "/account";
  const { state, account, refresh } = useAccountSession();
  const [here, setHere] = useState(safeAccountReturn(pathname));
  const [verificationState, setVerificationState] = useState<
    "idle" | "working" | "sent" | "error"
  >("idle");
  useEffect(() => setHere(currentReturnPath(pathname)), [pathname]);
  const stillSignedIn = state === "ready" && Boolean(account?.user);
  const refreshVerification = useCallback(async () => {
    setVerificationState("working");
    try {
      const auth = await getFirebaseClient();
      const user = auth?.currentUser;
      if (!user) throw new Error("No signed-in Firebase user is available.");
      await user.reload();
      await user.getIdToken(true);
      await syncFirebaseSession(user);
      await refresh();
      setVerificationState("idle");
    } catch {
      setVerificationState("error");
    }
  }, [refresh]);
  const resendVerification = useCallback(async () => {
    setVerificationState("working");
    try {
      const auth = await getFirebaseClient();
      if (!auth?.currentUser)
        throw new Error("No signed-in Firebase user is available.");
      await sendEmailVerification(auth.currentUser);
      setVerificationState("sent");
    } catch {
      setVerificationState("error");
    }
  }, []);

  return (
    <main id="main" className="account-page">
      <section className="account-hero">
        <span className="eyebrow">Airplane Games · The Aviation Arcade</span>
        <h1>My account</h1>
        <p>
          Manage your access to the photography community and editorial
          workspace.
        </p>
      </section>

      {signedOutReturn && state === "ready" && (
        <p className="account-notice" role="status">
          {stillSignedIn
            ? "You are still signed in. Your session could not be cleared."
            : "You’re signed out."}
        </p>
      )}
      {verificationNotice &&
        state === "ready" &&
        account?.user &&
        !account.user.emailVerified && (
          <p className="account-notice" role="status">
            {verificationSendFailed
              ? "Your account was created, but we couldn’t send a verification email. Use the resend option below to try again."
              : "Check your inbox for a verification link. You can resend it or check again after verifying."}
          </p>
        )}
      {verificationNotice &&
        state === "ready" &&
        account?.user?.emailVerified &&
        safeAccountReturn(returnTo) !== "/account" && (
          <p className="account-notice">
            <SiteLink className="text-link" href={safeAccountReturn(returnTo)}>
              Continue
            </SiteLink>
          </p>
        )}

      {state === "loading" && (
        <section className="account-panel" aria-live="polite">
          <span className="account-status-dot" /> Checking your account…
        </section>
      )}
      {state === "error" && (
        <section className="account-panel" role="alert">
          <h2>Account status unavailable</h2>
          <p>We couldn’t check your account just now. Try again to continue.</p>
          <button
            className="btn secondary"
            type="button"
            onClick={() => void refresh()}
          >
            Retry
          </button>
        </section>
      )}
      {state === "ready" && !account?.user && (
        <section className="account-panel">
          <div className="account-panel-icon">
            <UserCircle size={30} />
          </div>
          <h2>Sign in to continue</h2>
          <p>
            Use your account to view your submissions and, if you’re on the
            editorial team, open the editor workspace.
          </p>
          <SiteLink
            className="btn"
            href={accountSignInPath(here)}
            target="_top"
          >
            Sign in <ArrowRight size={17} />
          </SiteLink>
        </section>
      )}
      {state === "ready" && account?.user && (
        <>
          <section className="account-panel account-profile-panel">
            <span className="eyebrow">Signed in</span>
            <h2>{account.user.displayName}</h2>
            {account.user.emailVerified && <p role="status">Email verified.</p>}
            <p>
              The player profile currently shows sample data. Linking it to your
              Airplane Games app profile is coming soon; when available, we’ll
              use your existing Callsign without creating a new one.
            </p>
            {!account.user.emailVerified && (
              <div className="account-verify">
                <p>
                  Your email address is not verified yet. Verify it to keep your
                  account secure.
                </p>
                <div className="account-verify-actions">
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={verificationState === "working"}
                    onClick={() => void resendVerification()}
                  >
                    <EnvelopeSimple size={17} /> Resend verification
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={verificationState === "working"}
                    onClick={() => void refreshVerification()}
                  >
                    <ArrowClockwise size={17} /> I’ve verified
                  </button>
                </div>
                {verificationState === "working" && (
                  <p className="account-verify-result" role="status">
                    Updating verification status…
                  </p>
                )}
                {verificationState === "sent" && (
                  <p className="account-verify-result" role="status">
                    Verification email sent.
                  </p>
                )}
                {verificationState === "error" && (
                  <p className="account-verify-result" role="alert">
                    We couldn’t update verification right now. Please try again.
                  </p>
                )}
              </div>
            )}
            <SiteLink
              className="account-signout"
              href={accountSignOutPath()}
              target="_top"
            >
              <SignOut size={18} /> Sign out
            </SiteLink>
          </section>
          <div className="account-destinations">
            <section className="account-destination">
              <span className="eyebrow">Players</span>
              <h2>Player profile</h2>
              <p>
                Preview sample player stats. App profile linking is coming soon;
                your existing Callsign will be used without creating a new name
                tag.
              </p>
              <SiteLink className="text-link" href={audiences.player.home}>
                Open player profile <ArrowRight size={16} />
              </SiteLink>
            </section>
            <section className="account-destination">
              <span className="eyebrow">Photography community</span>
              <h2>My submissions</h2>
              <p>
                Review proposals you’ve sent to the Airplane Games photography
                collection.
              </p>
              <SiteLink className="text-link" href="/contribute?view=mine">
                View my submissions <ArrowRight size={16} />
              </SiteLink>
            </section>
            {account.isStaff && (
              <section className="account-destination">
                <span className="eyebrow">For the editorial team</span>
                <h2>Editorial workspace</h2>
                <p>Review photo proposals and manage the public collection.</p>
                <SiteLink className="text-link" href={audiences.admin.home}>
                  Open editor <ArrowRight size={16} />
                </SiteLink>
              </section>
            )}
          </div>
        </>
      )}
    </main>
  );
}
