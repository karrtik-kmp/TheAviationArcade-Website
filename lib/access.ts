import { cache } from "react";
import { redirect } from "next/navigation";
import { getProductUser, type ProductUser } from "@/lib/product-auth";
import { isStaffUser } from "@/lib/server";
import { isDemoPrincipal } from "@/lib/demo-server";
import { accountSessionKey } from "@/lib/account-server";
import {
  accountSignInPath,
  audiences,
  decideAccess,
  type Audience,
  type Principal,
} from "@/lib/account";

export type Viewer = {
  user: ProductUser;
  principal: Extract<Principal, { signedIn: true }>;
  sessionKey: string;
};

/** The current visitor, verified once per request no matter how many layouts and pages ask. */
export const currentViewer = cache(async (): Promise<Viewer | null> => {
  const user = await getProductUser();
  if (!user) return null;
  return {
    user,
    principal: {
      signedIn: true,
      displayName: user.displayName,
      emailVerified: user.emailVerified,
      staff: isStaffUser(user),
      demo: isDemoPrincipal(user),
    },
    sessionKey: await accountSessionKey(user.userId),
  };
});

export type AreaAccess =
  | { kind: "granted"; viewer: Viewer; readOnly: boolean }
  | { kind: "guest" }
  | { kind: "denied"; viewer: Viewer };

/**
 * The one access check for an audience's area. Redirects when the visitor
 * belongs on a sign-in page or in another area; otherwise says what to render.
 */
export async function requireArea(
  audience: Audience,
  returnTo: string = audiences[audience].home,
): Promise<AreaAccess> {
  const viewer = await currentViewer();
  const decision = decideAccess(
    audience,
    viewer?.principal ?? { signedIn: false },
  );
  switch (decision.kind) {
    case "sign-in":
      redirect(accountSignInPath(returnTo));
    case "elsewhere":
      redirect(decision.to);
    case "guest":
      return { kind: "guest" };
    case "denied":
      return { kind: "denied", viewer: viewer! };
    case "granted":
      return { kind: "granted", viewer: viewer!, readOnly: decision.readOnly };
  }
}

/** For an audience's sign-in page: someone already allowed in goes straight to the area. */
export async function redirectIfSignedIn(audience: Audience, returnTo: string) {
  const viewer = await currentViewer();
  if (!viewer) return;
  const decision = decideAccess(audience, viewer.principal);
  if (decision.kind === "granted") redirect(returnTo);
  if (decision.kind === "elsewhere") redirect(decision.to);
}
