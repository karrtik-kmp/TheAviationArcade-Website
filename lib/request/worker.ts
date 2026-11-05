/** Builds the principal's dependencies from the server environment. Server-only. */
import { runtime } from "#runtime";
import { firebaseSettings } from "@/lib/firebase-config";
import { productCookieName } from "@/lib/product-auth";
import { firebaseTokenVerifier } from "@/lib/request/firebase-token-verifier";
import { backendClient } from "@/lib/request/backend";
import { resolvePrincipal, type Bearer, type PrincipalDeps } from "@/lib/request/principal";
import { mockRoles, parseEmailList, readOwnRoles, rolesSource } from "@/lib/request/roles";

/** The game backend as this member, from `GAME_API_BASE_URL`. */
export function backendAs(bearer: Bearer, timeoutMs?: number) {
  return backendClient({ baseUrl: runtime.setting("GAME_API_BASE_URL"), timeoutMs }, bearer);
}

/** Where roles come from on this deployment (`ROLES_SOURCE`); mock until the backend is hosted. */
export function deploymentRolesSource() {
  return rolesSource(runtime.setting("ROLES_SOURCE"));
}

/**
 * The member's roles. With `ROLES_SOURCE=backend`, read from the game backend with the member's own
 * token (a short timeout: every signed-in page waits on it). Otherwise the deployment's mock lists.
 */
export async function rolesOf(bearer: Bearer, user: { email: string; emailVerified: boolean }) {
  if (deploymentRolesSource() === "backend") return readOwnRoles(backendAs(bearer, 4000));
  return mockRoles(user, {
    admins: parseEmailList(runtime.setting("MOCK_ADMIN_EMAILS")),
    photographers: parseEmailList(runtime.setting("MOCK_PHOTOGRAPHER_EMAILS")),
  });
}

export function principalDeps(host: string): PrincipalDeps {
  const settings = firebaseSettings(host);
  return {
    verifier:
      settings.configured && settings.config
        ? firebaseTokenVerifier({ projectId: settings.config.projectId, emulator: !!settings.emulatorUrl })
        : null,
    cookieName: productCookieName(host),
    roles: rolesOf,
    projectId: runtime.setting("FIREBASE_PROJECT_ID"),
    demoUid: runtime.setting("DEMO_ACCOUNT_UID"),
  };
}

export function requestPrincipal(headers: Headers) {
  return resolvePrincipal(headers, principalDeps(headers.get("host") ?? ""));
}
