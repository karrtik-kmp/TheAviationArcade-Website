import type { FirebaseTokenIdentity } from "@/lib/firebase-verifier";

export type ProductUser = FirebaseTokenIdentity & { displayName: string };
export function localAuthHost(host: string) {
  try {
    return (
      import.meta.env.DEV === true &&
      ["127.0.0.1", "localhost", "::1"].includes(
        new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, ""),
      )
    );
  } catch {
    return false;
  }
}
export function productCookieName(host: string) {
  return localAuthHost(host) ? "aa_session" : "__Host-aa_session";
}
