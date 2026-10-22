import { getProductUser } from "@/lib/product-auth";
import { isStaff } from "@/lib/server";
import type { AccountSnapshot } from "@/lib/account";

// A change detector for this Site's UI, never a credential or a shared game principal.
export async function accountSessionKey(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`airplane-games-site-session:${userId}`),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function accountSnapshot(): Promise<AccountSnapshot> {
  const user = await getProductUser();
  if (!user) return { user: null, isStaff: false, sessionKey: null };
  return {
    user: { displayName: user.displayName, emailVerified: user.emailVerified },
    isStaff: await isStaff(),
    sessionKey: await accountSessionKey(user.userId),
  };
}
