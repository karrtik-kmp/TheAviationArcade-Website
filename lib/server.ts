import { runtime } from "#runtime";
import { BunnyPhotoStorage } from "@/lib/bunny-storage";
import type { PhotoStorage } from "@/lib/photo-storage";
export { HttpError, sameOrigin, respond, failure, limitedForm } from "@/lib/errors";
import { HttpError } from "@/lib/errors";
export function database(): D1Database {
  const db = runtime.d1();
  if (!db)
    throw new HttpError(
      503,
      "The content database is unavailable. Please try again.",
    );
  return db;
}
export function bucket(): PhotoStorage {
  const provider = runtime.setting("PHOTO_STORAGE_PROVIDER");
  if (provider === "bunny") {
    try {
      return new BunnyPhotoStorage({
        zone: runtime.setting("BUNNY_STORAGE_ZONE") ?? "",
        endpoint: runtime.setting("BUNNY_STORAGE_ENDPOINT") ?? "",
        region: runtime.setting("BUNNY_STORAGE_REGION") ?? "",
        password: runtime.setting("BUNNY_STORAGE_PASSWORD") ?? "",
      });
    } catch {
      throw new HttpError(503, "Photo storage is unavailable. Please try again.");
    }
  }
  if (provider && provider !== "r2")
    throw new HttpError(503, "Photo storage is unavailable. Please try again.");
  const r2 = runtime.r2Bucket();
  if (!r2)
    throw new HttpError(503, "Photo storage is unavailable. Please try again.");
  return r2;
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
