import { headers } from "next/headers";
import { requestPrincipal } from "@/lib/request/worker";
import type { AccountSnapshot } from "@/lib/account";

// A change detector for this Site's UI, never a credential or a shared game principal.
export { accountSessionKey } from "@/lib/request/principal";

/** The signed-in account for the UI, from the same single verification as the API. */
export async function accountSnapshot(): Promise<AccountSnapshot> {
  const viewer = await requestPrincipal(await headers());
  if (viewer.kind === "guest") return { user: null, isStaff: false, sessionKey: null };
  return {
    user: { displayName: viewer.displayName, emailVerified: viewer.emailVerified },
    isStaff: viewer.staff,
    sessionKey: viewer.sessionKey,
  };
}
