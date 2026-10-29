/** Builds the principal's dependencies from the Worker environment. Server-only. */
import { env } from "cloudflare:workers";
import { firebaseSettings } from "@/lib/firebase-config";
import { productCookieName } from "@/lib/product-auth";
import { firebaseTokenVerifier } from "@/lib/request/firebase-token-verifier";
import { parseStaffEmails, resolvePrincipal, type PrincipalDeps } from "@/lib/request/principal";

export function principalDeps(host: string): PrincipalDeps {
  const settings = firebaseSettings(host);
  return {
    verifier:
      settings.configured && settings.config
        ? firebaseTokenVerifier({ projectId: settings.config.projectId, emulator: !!settings.emulatorUrl })
        : null,
    cookieName: productCookieName(host),
    staffEmails: parseStaffEmails(env.STAFF_EMAILS),
    projectId: env.FIREBASE_PROJECT_ID,
    demoUid: env.DEMO_ACCOUNT_UID,
  };
}

export function requestPrincipal(headers: Headers) {
  return resolvePrincipal(headers, principalDeps(headers.get("host") ?? ""));
}
