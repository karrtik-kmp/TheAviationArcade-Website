"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AccountSnapshot } from "@/lib/account";
type AccountSession = {
  state: "loading" | "ready" | "error";
  account: AccountSnapshot | null;
  refresh: () => Promise<void>;
  reportAccess: (status: number) => void;
};
const Context = createContext<AccountSession | null>(null);
export function AccountSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<AccountSession["state"]>("loading");
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const serial = useRef(0),
    active = useRef(true),
    aborter = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    const request = ++serial.current;
    setState("loading");
    aborter.current?.abort();
    const controller = new AbortController();
    aborter.current = controller;
    try {
      const { getFirebaseClient, syncFirebaseSession } =
        await import("@/lib/firebase-client");
      const auth = await getFirebaseClient();
      if (auth) await syncFirebaseSession(auth.currentUser);
      if (request !== serial.current || controller.signal.aborted) return;
      const response = await fetch("/api/account", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Account check failed");
      const next = (await response.json()) as AccountSnapshot;
      if (
        typeof next.isStaff !== "boolean" ||
        (next.user !== null && typeof next.user?.displayName !== "string") ||
        (next.user
          ? typeof next.sessionKey !== "string"
          : next.sessionKey !== null)
      )
        throw new Error("Invalid account response");
      if (active.current && request === serial.current) {
        setAccount(next);
        setState("ready");
      }
    } catch {
      if (
        active.current &&
        request === serial.current &&
        !controller.signal.aborted
      )
        setState("error");
    }
  }, []);
  const reportAccess = useCallback(
    (status: number) => {
      if (status !== 401 && status !== 403 && status !== 409) return;
      ++serial.current;
      aborter.current?.abort();
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
      let first = true;
      unsubscribe = onIdTokenChanged(auth, () => {
        if (first) {
          first = false;
          return;
        }
        void refresh();
      });
    })().catch(() => {
      if (active.current) setState("error");
    });
    const focus = () => void refresh();
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const changing = () => {
      ++serial.current;
      aborter.current?.abort();
      setAccount({ user: null, isStaff: false, sessionKey: null });
      setState("loading");
    };
    const failed = () => {
      ++serial.current;
      aborter.current?.abort();
      setAccount(null);
      setState("error");
    };
    window.addEventListener("aa-auth-changing", changing);
    window.addEventListener("aa-auth-changed", focus);
    window.addEventListener("aa-auth-error", failed);
    window.addEventListener("focus", focus);
    window.addEventListener("pageshow", focus);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active.current = false;
      ++serial.current;
      aborter.current?.abort();
      unsubscribe?.();
      window.removeEventListener("aa-auth-changing", changing);
      window.removeEventListener("aa-auth-changed", focus);
      window.removeEventListener("aa-auth-error", failed);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pageshow", focus);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  return (
    <Context.Provider value={{ state, account, refresh, reportAccess }}>
      {children}
    </Context.Provider>
  );
}
export function useAccountSession() {
  const session = useContext(Context);
  if (!session) throw new Error("AccountSessionProvider is required");
  return session;
}
