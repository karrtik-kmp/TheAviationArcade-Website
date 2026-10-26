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
import {
  audiences,
  safeAccountReturn,
  signInPath,
  type Audience,
  type CommunityRole,
} from "@/lib/account";
import { navigateTo, sitePath } from "@/lib/paths";
import { SiteLink } from "@/components/SiteLink";
import { Eye, EyeSlash } from "@phosphor-icons/react";

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

const intro: Record<Audience, string> = {
  admin: "Editors sign in with an authorized staff account.",
  photographer: "Sign in to propose photos and track their review.",
  player:
    "Sign in to your Airplane Games account.",
};

const roleHint: Record<CommunityRole, string> = {
  photographer: "Share aviation photos",
  player: "Review progress and join the community",
};

/**
 * One sign-in form for every audience. The server decides where each sign-in
 * lands. With `roles`, the visitor picks which of them they're signing in as.
 */
export function AuthForm({
  audience,
  returnTo,
  roles,
}: {
  audience: Audience;
  /** Where to go for the initial `audience`; switching role goes to that role's home. */
  returnTo: string;
  roles?: readonly CommunityRole[];
}) {
  const [role, setRole] = useState<Audience>(audience);
  const [mode, setMode] = useState<Mode>("signin");
  const editor = audience === "admin";
  const destination = role === audience ? returnTo : audiences[role].home;
  const [configState, setConfigState] = useState<ConfigState>("checking");
  const [auth, setAuth] = useState<Auth | null>(null);
  const [emulator, setEmulator] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [demo, setDemo] = useState<{ email: string; password: string } | null>(
    null,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [response, firebaseAuth] = await Promise.all([
          fetch(sitePath("/api/auth/config"), { cache: "no-store" }),
          getFirebaseClient(),
        ]);
        if (!response.ok)
          throw new Error("Firebase configuration is unavailable");
        const result = (await response.json()) as {
          configured?: boolean;
          emulatorUrl?: string | null;
          demoLogin?: { email: string; password: string } | null;
        };
        if (!active) return;
        if (!result.configured || !firebaseAuth) {
          setConfigState("missing");
          return;
        }
        setAuth(firebaseAuth);
        if (
          audience === "admin" &&
          typeof result.demoLogin?.email === "string" &&
          typeof result.demoLogin.password === "string"
        )
          setDemo(result.demoLogin);
        setEmulator(Boolean(result.emulatorUrl));
        setConfigState("ready");
      } catch {
        if (active) setConfigState("error");
      }
    })();
    return () => {
      active = false;
    };
  }, [audience]);

  async function finishSignIn(user: User, signup = false, suffix = "") {
    const landing = await syncFirebaseSession(user, {
      audience: role,
      returnTo: safeAccountReturn(destination),
      signup,
    });
    navigateTo((landing ?? audiences[role].home) + suffix);
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
        await finishSignIn(
          credential.user,
          true,
          verificationFailed ? "&verification_error=1" : "",
        );
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

  function chooseRole(next: CommunityRole) {
    setRole(next);
    setError("");
    // Keep the address shareable and correct on reload.
    window.history.replaceState(
      null,
      "",
      sitePath(signInPath(next, next === audience ? returnTo : null)),
    );
  }

  return (
    <section className={`auth-card${editor ? " auth-card-editor" : ""}${!editor ? " community-auth-card" : ""}`}>
      <span className="eyebrow">
        {editor ? "Staff access" : `Airplane Games · ${audiences[role].label}`}
      </span>
      <h1>{editor && mode === "signin" ? "Editor sign in" : title}</h1>
      {roles && mode !== "reset" && (
        <fieldset className="auth-roles" disabled={busy}>
          <legend>I’m signing in as</legend>
          {roles.map((option) => (
            <label
              key={option}
              className={`auth-role${role === option ? " active" : ""}`}
            >
              <input
                type="radio"
                name="role"
                value={option}
                checked={role === option}
                onChange={() => chooseRole(option)}
              />
              <strong>{audiences[option].label}</strong>
              <small>{roleHint[option]}</small>
            </label>
          ))}
        </fieldset>
      )}
      <p className="auth-intro">
        {mode === "reset"
          ? "Enter the email address on your account and we’ll send a reset link if it exists."
          : mode === "signup"
            ? "Create an account to submit aviation photos and follow their review."
            : role === "photographer"
              ? "Sign in to submit your aviation photos."
              : intro[role]}
      </p>
      {emulator && (
        <p className="auth-setup-notice" role="status">
          Local demo: accounts and email actions use the Firebase emulator.
          Google sign-in is simulated.
        </p>
      )}
      {demo && mode === "signin" && (
        <aside className="auth-setup-notice">
          <strong>Explore the demo</strong>
          <p>
            View the sample editorial content. The demo account is view only.
          </p>
          <p>
            Email: <code>{demo.email}</code>
            <br />
            Password: <code>{demo.password}</code>
          </p>
          <button
            className="btn secondary"
            type="button"
            disabled={!configured || busy}
            onClick={() => {
              setEmail(demo.email);
              setPassword(demo.password);
              setError("");
              setNotice(
                "Demo credentials filled. Select Sign in to open the demo.",
              );
            }}
          >
            Fill demo login
          </button>
        </aside>
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
      {mode !== "reset" && <button
        className="btn secondary auth-google"
        type="button"
        disabled={!configured || busy}
        onClick={() => void onGoogle()}
      >
        <span className="auth-google-mark" aria-hidden="true">
          G
        </span>{" "}
        Continue with Google
      </button>}
      {mode !== "reset" && <div className="auth-divider">
        <span>or use email</span>
      </div>}
      <form className="auth-form" onSubmit={(event) => void onSubmit(event)}>
        <label className="field">
          <span>Email address</span>
          <input
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
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
            <span className="community-password-control">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                minLength={mode === "signup" ? 8 : undefined}
                required
                disabled={!configured || busy}
              />
              <button className="community-password-toggle" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((shown) => !shown)} disabled={!configured || busy}>
                {showPassword ? <EyeSlash size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </span>
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
            {/* Editor accounts are invited by the team, never self-registered here. */}
            {!editor && <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode("signup");
                setPassword("");
                setError("");
                setNotice("");
              }}
            >
              Create an account
            </button>}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode("reset");
                setPassword("");
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
            disabled={busy}
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
            disabled={busy}
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
      {!editor && (
        <SiteLink className="auth-back-link" href="/account">
          Back to my account
        </SiteLink>
      )}
    </section>
  );
}
