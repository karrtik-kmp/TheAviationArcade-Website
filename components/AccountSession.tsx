"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  safeAccountReturn,
  shouldRecheckOnReturn,
  type AccountSnapshot,
} from "@/lib/account";
import { appPath, sitePath } from "@/lib/paths";

/** The page being viewed, as a safe app path to come back to after an auth step. */
export function currentReturnPath(pathname: string) {
  if (typeof window === "undefined") return safeAccountReturn(pathname);
  return safeAccountReturn(
    appPath(window.location.pathname) +
      window.location.search +
      window.location.hash,
  );
}
type AccountSession = {
  state: "loading" | "ready" | "error";
  account: AccountSnapshot | null;
  refresh: () => Promise<void>;
  reportAccess: (status: number) => void;
};
const Context = createContext<AccountSession | null>(null);
async function readAccount(signal: AbortSignal): Promise<AccountSnapshot> {
  const response = await fetch(sitePath("/api/account"), {
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error("Account check failed");
  const next = (await response.json()) as AccountSnapshot;
  if (
    typeof next.isStaff !== "boolean" ||
    (next.user !== null && typeof next.user?.displayName !== "string") ||
    (next.user ? typeof next.sessionKey !== "string" : next.sessionKey !== null)
  )
    throw new Error("Invalid account response");
  return next;
}
export function AccountSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<AccountSession["state"]>("loading");
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const serial = useRef(0),
    active = useRef(true),
    aborter = useRef<AbortController | null>(null),
    pending = useRef<number | null>(null),
    lastConfirmed = useRef<number | null>(null),
    confirmedFirebaseUid = useRef<string | null>(null),
    observedFirebaseUid = useRef<string | null>(null),
    firebaseAuth = useRef<{ currentUser: { uid: string } | null } | null>(null),
    stateRef = useRef(state),
    accountRef = useRef<AccountSnapshot | null>(account);
  stateRef.current = state;
  accountRef.current = account;
  const refresh = useCallback(async () => {
    const request = ++serial.current;
    pending.current = request;
    // Re-checking the user already on screen happens in the background: the
    // page keeps what it shows, and the server still authorizes every request.
    const sameUser = (uid: string | null) =>
      uid !== null &&
      confirmedFirebaseUid.current === uid &&
      !!accountRef.current?.user;
    let quiet =
      stateRef.current === "ready" &&
      sameUser(firebaseAuth.current?.currentUser?.uid ?? null);
    if (!quiet) setState("loading");
    aborter.current?.abort();
    const controller = new AbortController();
    aborter.current = controller;
    const stale = () =>
      request !== serial.current || controller.signal.aborted;
    try {
      const { getFirebaseClient, syncFirebaseSession } =
        await import("@/lib/firebase-client");
      const auth = await getFirebaseClient();
      firebaseAuth.current = auth;
      const firebaseUid = auth?.currentUser?.uid ?? null;
      if (stale()) return;
      observedFirebaseUid.current = firebaseUid;
      if (!sameUser(firebaseUid)) {
        quiet = false;
        confirmedFirebaseUid.current = null;
        setAccount(null);
        setState("loading");
      }
      if (auth) await syncFirebaseSession(auth.currentUser);
      if (stale()) return;
      let next = await readAccount(controller.signal);
      if (!next.user && auth?.currentUser) {
        // Firebase still has this user but the cookie is gone: mirror it once more.
        await syncFirebaseSession(auth.currentUser, undefined, true);
        if (stale()) return;
        next = await readAccount(controller.signal);
      }
      if ((auth?.currentUser?.uid ?? null) !== firebaseUid) {
        confirmedFirebaseUid.current = null;
        observedFirebaseUid.current = auth?.currentUser?.uid ?? null;
        setAccount(null);
        setState("loading");
        void refresh();
        return;
      }
      if (active.current && !stale()) {
        confirmedFirebaseUid.current = next.user ? firebaseUid : null;
        lastConfirmed.current = Date.now();
        setAccount(next);
        setState("ready");
      }
    } catch {
      // A failed background check keeps the page; the next return retries, and
      // a rejected request still reaches reportAccess.
      if (active.current && !stale() && !quiet) {
        confirmedFirebaseUid.current = null;
        setState("error");
      }
    } finally {
      if (pending.current === request) pending.current = null;
    }
  }, []);
  const reportAccess = useCallback(
    (status: number) => {
      if (status !== 401 && status !== 403 && status !== 409) return;
      ++serial.current;
      aborter.current?.abort();
      // The server refused this account, so the next check must block the page.
      confirmedFirebaseUid.current = null;
      if (status === 401) {
        setAccount({ user: null, isStaff: false, sessionKey: null });
        setState("ready");
      } else {
        setState("error");
        void refresh();
      }
    },
    [refresh],
  );
  useEffect(() => {
    active.current = true;
    void refresh();
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const { getFirebaseClient } = await import("@/lib/firebase-client");
      const auth = await getFirebaseClient();
      if (!auth || !active.current) return;
      const { onIdTokenChanged } = await import("firebase/auth");
      if (!active.current) return;
      firebaseAuth.current = auth;
      let first = true;
      unsubscribe = onIdTokenChanged(auth, (nextUser) => {
        if (first) {
          first = false;
          observedFirebaseUid.current = nextUser?.uid ?? null;
          return;
        }
        const nextUid = nextUser?.uid ?? null;
        if (observedFirebaseUid.current !== nextUid) {
          observedFirebaseUid.current = nextUid;
          confirmedFirebaseUid.current = null;
          setAccount(null);
        }
        void refresh();
      });
    })().catch(() => {
      if (active.current) setState("error");
    });
    const changed = () => void refresh();
    const returned = (restored = false) => {
      if (document.visibilityState !== "visible") return;
      if (
        shouldRecheckOnReturn({
          now: Date.now(),
          lastConfirmed: lastConfirmed.current,
          checking: pending.current === serial.current,
          restored,
        })
      )
        void refresh();
    };
    const focus = () => returned();
    const shown = (event: PageTransitionEvent) => returned(event.persisted);
    const changing = () => {
      ++serial.current;
      aborter.current?.abort();
      confirmedFirebaseUid.current = null;
      observedFirebaseUid.current = null;
      setAccount({ user: null, isStaff: false, sessionKey: null });
      setState("loading");
    };
    const failed = () => {
      ++serial.current;
      aborter.current?.abort();
      confirmedFirebaseUid.current = null;
      setAccount(null);
      setState("error");
    };
    window.addEventListener("aa-auth-changing", changing);
    window.addEventListener("aa-auth-changed", changed);
    window.addEventListener("aa-auth-error", failed);
    window.addEventListener("focus", focus);
    window.addEventListener("pageshow", shown);
    document.addEventListener("visibilitychange", focus);
    return () => {
      active.current = false;
      ++serial.current;
      aborter.current?.abort();
      unsubscribe?.();
      window.removeEventListener("aa-auth-changing", changing);
      window.removeEventListener("aa-auth-changed", changed);
      window.removeEventListener("aa-auth-error", failed);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pageshow", shown);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [refresh]);
  return (
    <Context.Provider
      value={{ state, account, refresh, reportAccess }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAccountSession() {
  const session = useContext(Context);
  if (!session) throw new Error("AccountSessionProvider is required");
  return session;
}
