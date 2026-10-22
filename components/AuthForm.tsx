"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  type Auth,
  type User,
} from "firebase/auth";
import { getFirebaseClient, syncFirebaseSession } from "@/lib/firebase-client";
import { safeAccountReturn } from "@/lib/account";
import { SiteLink } from "@/components/SiteLink";

type Mode = "signin" | "signup" | "reset";
type ConfigState = "checking" | "ready" | "missing" | "error";

function errorCopy(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (
    code === "auth/invalid-credential" ||
    code === "auth/wrong-password" ||
    code === "auth/user-not-found"
  )
    return "Email or password is incorrect.";
  if (code === "auth/email-already-in-use")
    return "An account already uses this email. Try signing in instead.";
  if (code === "auth/weak-password")
    return "Choose a password with at least 8 characters.";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/popup-closed-by-user")
    return "Google sign-in was closed before it finished.";
  if (code === "auth/popup-blocked")
    return "Your browser blocked the Google sign-in window. Allow popups and try again.";
  if (code === "auth/too-many-requests")
    return "Too many attempts. Wait a little and try again.";
  return "We couldn’t complete that request. Please try again.";
}

export function AuthForm({ returnTo }: { returnTo: string }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [configState, setConfigState] = useState<ConfigState>("checking");
  const [auth, setAuth] = useState<Auth | null>(null);
  const [emulator, setEmulator] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [response, firebaseAuth] = await Promise.all([
          fetch("/api/auth/config", { cache: "no-store" }),
          getFirebaseClient(),
        ]);
        if (!response.ok)
          throw new Error("Firebase configuration is unavailable");
        const result = (await response.json()) as {
          configured?: boolean;
          emulatorUrl?: string | null;
        };
        if (!active) return;
        if (!result.configured || !firebaseAuth) {
          setConfigState("missing");
          return;
        }
        setAuth(firebaseAuth);
        setEmulator(Boolean(result.emulatorUrl));
        setConfigState("ready");
      } catch {
        if (active) setConfigState("error");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function finishSignIn(user: User, signup = false) {
    await syncFirebaseSession(user);
    const destination =
      signup || !user.emailVerified
        ? `/account?verify_email=1&return_to=${encodeURIComponent(safeAccountReturn(returnTo))}`
        : safeAccountReturn(returnTo);
    if (window.top && window.top !== window)
      window.top.location.assign(destination);
    else window.location.assign(destination);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || configState !== "ready") return;
    setBusy(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const displayName = String(form.get("displayName") ?? "").trim();
    try {
      if (mode === "reset") {
        await sendPasswordResetEmail(auth, email);
        setNotice(
          "If an account exists for that email, a password reset link is on its way.",
        );
      } else if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        if (displayName) await updateProfile(credential.user, { displayName });
        await credential.user.getIdToken(true);
        let verificationFailed = false;
        try {
          await sendEmailVerification(credential.user);
        } catch {
          verificationFailed = true;
        }
        await syncFirebaseSession(credential.user);
        const suffix = verificationFailed ? "&verification_error=1" : "";
        const destination =
          "/account?verify_email=1&return_to=" +
          encodeURIComponent(safeAccountReturn(returnTo)) +
          suffix;
        if (window.top && window.top !== window)
          window.top.location.assign(destination);
        else window.location.assign(destination);
      } else {
        const credential = await signInWithEmailAndPassword(
          auth,
          email,
          password,
        );
        await finishSignIn(credential.user);
      }
    } catch (requestError) {
      if (
        mode === "reset" &&
        (requestError as { code?: string })?.code === "auth/user-not-found"
      )
        setNotice(
          "If an account exists for that email, a password reset link is on its way.",
        );
      else setError(errorCopy(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    if (!auth || configState !== "ready") return;
    setBusy(true);
    setError("");
    setNotice("");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      const credential = await signInWithPopup(auth, provider);
      await finishSignIn(credential.user);
    } catch (requestError) {
      setError(errorCopy(requestError));
    } finally {
      setBusy(false);
    }
  }

  const configured = configState === "ready";
  const title =
    mode === "signup"
      ? "Create your account"
      : mode === "reset"
        ? "Reset your password"
        : "Sign in";
  const submitLabel =
    mode === "signup"
      ? "Create account"
      : mode === "reset"
        ? "Send reset link"
        : "Sign in";

  return (
    <section className="auth-card">
      <span className="eyebrow">Airplane Games account</span>
      <h1>{title}</h1>
      <p className="auth-intro">
        Use email and password or continue with Google.
      </p>
      {emulator && (
        <p className="auth-setup-notice" role="status">
          Local demo: accounts and email actions use the Firebase emulator.
          Google sign-in is simulated.
        </p>
      )}
      {configState === "missing" && (
        <p className="auth-setup-notice" role="status">
          Sign-in is unavailable because Firebase is not configured for this
          site yet.
        </p>
      )}
      {configState === "error" && (
        <p className="auth-setup-notice" role="alert">
          We couldn’t check sign-in setup. Reload this page to try again.
        </p>
      )}
      {notice && (
        <p className="auth-message" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="auth-message auth-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="btn secondary auth-google"
        type="button"
        disabled={!configured || busy}
        onClick={() => void onGoogle()}
      >
        <span className="auth-google-mark" aria-hidden="true">
          G
        </span>{" "}
        Continue with Google
      </button>
      <div className="auth-divider">
        <span>or use email</span>
      </div>
      <form className="auth-form" onSubmit={(event) => void onSubmit(event)}>
        <label className="field">
          <span>Email address</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            disabled={!configured || busy}
          />
        </label>
        {mode === "signup" && (
          <label className="field">
            <span>
              Display name <small>Optional</small>
            </span>
            <input
              type="text"
              name="displayName"
              autoComplete="name"
              maxLength={80}
              disabled={!configured || busy}
            />
          </label>
        )}
        {mode !== "reset" && (
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              name="password"
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              minLength={mode === "signup" ? 8 : undefined}
              required
              disabled={!configured || busy}
            />
            {mode === "signup" && <small>Use at least 8 characters.</small>}
          </label>
        )}
        <button
          className="btn auth-submit"
          type="submit"
          disabled={!configured || busy}
        >
          {busy ? "Please wait…" : submitLabel}
        </button>
      </form>
      <div className="auth-mode-links">
        {mode === "signin" && (
          <>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError("");
                setNotice("");
              }}
            >
              Create an account
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("reset");
                setError("");
                setNotice("");
              }}
            >
              Forgot password?
            </button>
          </>
        )}
        {mode === "signup" && (
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError("");
              setNotice("");
            }}
          >
            Already have an account? Sign in
          </button>
        )}
        {mode === "reset" && (
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError("");
              setNotice("");
            }}
          >
            Back to sign in
          </button>
        )}
      </div>
      <SiteLink className="auth-back-link" href="/account">
        Back to my account
      </SiteLink>
    </section>
  );
}
