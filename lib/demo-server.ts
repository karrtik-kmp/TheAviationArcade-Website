import { runtime } from "#runtime";
import { firebaseSettings } from "@/lib/firebase-config";
import { matchesDemoPrincipal } from "@/lib/demo-policy";

/** Demo uses ordinary Firebase tokens. This marker only removes capabilities. */
export function isDemoPrincipal(user: { userId: string } | null): boolean {
  if (!user) return false;
  const project = runtime.setting("FIREBASE_PROJECT_ID");
  const uid = runtime.setting("DEMO_ACCOUNT_UID");
  return matchesDemoPrincipal(user.userId, project, uid);
}

export function demoLogin(host: string) {
  const settings = firebaseSettings(host);
  const email = runtime.setting("DEMO_LOGIN_EMAIL");
  const password = runtime.setting("DEMO_LOGIN_PASSWORD");
  if (!settings.configured || !runtime.setting("DEMO_ACCOUNT_UID") || !email || !password) return null;
  // Explicitly configured public sample credentials, never a staff credential.
  return { email, password };
}
