import { headers } from "next/headers";
import { firebaseSettings } from "@/lib/firebase-config";
import { verifyFirebaseToken } from "@/lib/firebase-verifier";
import type { FirebaseTokenIdentity } from "@/lib/firebase-verifier";
import { decodeJwt, decodeProtectedHeader } from "jose";

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
export async function getProductUser(): Promise<ProductUser | null> {
  const incoming = await headers(),
    host = incoming.get("host") ?? "";
  const settings = firebaseSettings(host);
  if (!settings.configured || !settings.config) return null;
  const name = productCookieName(host);
  const cookies = (incoming.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (cookies.length !== 1) return null;
  const token = cookies[0].slice(name.length + 1);
  try {
    decodeProtectedHeader(token);
    decodeJwt(token);
  } catch {
    return null;
  }
  try {
    const user = await verifyFirebaseToken(token, {
      projectId: settings.config.projectId,
      emulator: !!settings.emulatorUrl,
    });
    return {
      ...user,
      displayName: user.fullName?.trim().slice(0, 120) || "Account",
    };
  } catch (error) {
    if (
      error instanceof TypeError ||
      (error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ERR_JWKS_TIMEOUT")
    )
      throw new Error("Authentication service unavailable");
    return null;
  }
}
