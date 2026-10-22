"use client";
import { getApps, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";

let client: Promise<Auth | null> | null = null;
let queue: Promise<unknown> = Promise.resolve();
let generation = 0;
let owner: string | null | undefined;
let signingOut = false;
const channel =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("airplane-games-product-auth")
    : null;
const announce = (name: string) => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(name));
};
channel?.addEventListener("message", (event) => {
  if (event.data === "logout")
    void performLogout(false).catch(() => announce("aa-auth-error"));
});

export function getFirebaseClient(): Promise<Auth | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!client)
    client = (async () => {
      const response = await fetch("/api/auth/config", { cache: "no-store" });
      if (!response.ok)
        throw new Error("Sign-in setup could not be loaded. Please retry.");
      const settings = (await response.json()) as {
        configured: boolean;
        config: {
          apiKey: string;
          authDomain: string;
          projectId: string;
          appId: string;
        } | null;
        emulatorUrl: string | null;
      };
      if (!settings.configured || !settings.config) return null;
      const app =
        getApps().find((entry) => entry.name === "airplane-games") ??
        initializeApp(settings.config, "airplane-games");
      const auth = getAuth(app);
      if (settings.emulatorUrl) {
        if (
          process.env.NODE_ENV === "production" ||
          !["localhost", "127.0.0.1", "[::1]"].includes(
            window.location.hostname,
          )
        )
          throw new Error(
            "Local authentication is not available on this host.",
          );
        connectAuthEmulator(auth, settings.emulatorUrl, {
          disableWarnings: true,
        });
      }
      await auth.authStateReady();
      return auth;
    })().catch((error) => {
      client = null;
      throw error;
    });
  return client;
}
function serialize<T>(run: () => Promise<T>): Promise<T> {
  const next = queue
    .catch(() => undefined)
    .then(async () => {
      if (typeof navigator !== "undefined" && navigator.locks) {
        const result = await navigator.locks.request(
          "airplane-games-session-cookie",
          run,
        );
        return result as T;
      }
      return await run();
    });
  queue = next.catch(() => undefined);
  return next;
}
async function exchange(user: User | null) {
  const response = await fetch(
    "/api/auth/session",
    user
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: await user.getIdToken() }),
        }
      : { method: "DELETE" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      body.error || "Your account session could not be updated. Please retry.",
    );
  }
}
export async function syncFirebaseSession(user: User | null): Promise<void> {
  if (signingOut) return;
  const uid = user?.uid ?? null;
  if (owner !== uid) {
    owner = uid;
    generation += 1;
  }
  const ticket = generation;
  await serialize(async () => {
    if (signingOut || ticket !== generation) return;
    const auth = await getFirebaseClient();
    if ((auth?.currentUser?.uid ?? null) !== uid) return;
    await exchange(user);
  });
}
async function performLogout(broadcast: boolean): Promise<void> {
  signingOut = true;
  generation += 1;
  owner = null;
  announce("aa-auth-changing");
  if (broadcast) channel?.postMessage("logout");
  let failure: unknown;
  try {
    const auth = await getFirebaseClient();
    if (auth) await signOut(auth);
  } catch (error) {
    failure = error;
  }
  try {
    await serialize(() => exchange(null));
  } catch (error) {
    failure = error;
  }
  signingOut = false;
  if (failure) {
    announce("aa-auth-error");
    throw failure;
  }
  announce("aa-auth-changed");
}
export function logoutFirebase(): Promise<void> {
  return performLogout(true);
}
