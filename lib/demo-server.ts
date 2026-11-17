import { setting } from "@/lib/settings";
import { matchesDemoPrincipal } from "@/lib/demo-policy";

/** Demo uses ordinary Firebase tokens. This marker only removes capabilities. */
export function isDemoPrincipal(user: { userId: string } | null): boolean {
  if (!user) return false;
  const project = setting("FIREBASE_PROJECT_ID");
  const uid = setting("DEMO_ACCOUNT_UID");
  return matchesDemoPrincipal(user.userId, project, uid);
}
