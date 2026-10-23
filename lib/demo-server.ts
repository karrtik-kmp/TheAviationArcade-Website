import { env } from "cloudflare:workers";
import { firebaseSettings } from "@/lib/firebase-config";
import { matchesDemoPrincipal } from "@/lib/demo-policy";

/** Demo uses ordinary Firebase tokens. This marker only removes capabilities. */
export function isDemoPrincipal(user: { userId: string } | null): boolean {
  if (!user) return false;
  const project = env.FIREBASE_PROJECT_ID;
  const uid = env.DEMO_ACCOUNT_UID;
  return matchesDemoPrincipal(user.userId, project, uid);
}

export function demoLogin(host: string) {
  const settings = firebaseSettings(host);
  if (!settings.configured || !env.DEMO_ACCOUNT_UID || !env.DEMO_LOGIN_EMAIL || !env.DEMO_LOGIN_PASSWORD)
    return null;
  if ((env.STAFF_EMAILS ?? "").split(",").some((email) => email.trim().toLowerCase() === env.DEMO_LOGIN_EMAIL!.toLowerCase()))
    return null;
  // Explicitly configured public sample credentials, never a staff credential.
  return { email: env.DEMO_LOGIN_EMAIL, password: env.DEMO_LOGIN_PASSWORD };
}
