import { env } from "cloudflare:workers";
import type { ProductUser } from "@/lib/product-auth";
import { isDemoPrincipal } from "@/lib/demo-server";
import { BunnyPhotoStorage } from "@/lib/bunny-storage";
import type { PhotoStorage } from "@/lib/photo-storage";
export { HttpError, sameOrigin, respond, failure, limitedForm } from "@/lib/errors";
import { HttpError } from "@/lib/errors";
import { isStaffIdentity, parseStaffEmails } from "@/lib/request/principal";
export function database(): D1Database {
  if (!env.DB)
    throw new HttpError(
      503,
      "The content database is unavailable. Please try again.",
    );
  return env.DB;
}
export function bucket(): PhotoStorage {
  if (env.PHOTO_STORAGE_PROVIDER === "bunny") {
    try {
      return new BunnyPhotoStorage({
        zone: env.BUNNY_STORAGE_ZONE ?? "",
        endpoint: env.BUNNY_STORAGE_ENDPOINT ?? "",
        region: env.BUNNY_STORAGE_REGION ?? "",
        password: env.BUNNY_STORAGE_PASSWORD ?? "",
      });
    } catch {
      throw new HttpError(503, "Photo storage is unavailable. Please try again.");
    }
  }
  if (env.PHOTO_STORAGE_PROVIDER && env.PHOTO_STORAGE_PROVIDER !== "r2")
    throw new HttpError(503, "Photo storage is unavailable. Please try again.");
  if (!env.BUCKET)
    throw new HttpError(503, "Photo storage is unavailable. Please try again.");
  return env.BUCKET;
}
export function isStaffUser(user: ProductUser | null) {
  return !!user && isStaffIdentity(user, isDemoPrincipal(user), parseStaffEmails(env.STAFF_EMAILS));
}
export function audit(
  actor: string,
  entity: string,
  action: string,
  detail: unknown,
) {
  return database()
    .prepare(
      "INSERT INTO audit_events (id, actor_id, entity_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      actor,
      entity,
      action,
      JSON.stringify(detail),
      new Date().toISOString(),
    );
}
