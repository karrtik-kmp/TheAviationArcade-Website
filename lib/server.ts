import { setting } from "@/lib/settings";
import { BunnyPhotoStorage } from "@/lib/bunny-storage";
import type { PhotoStorage } from "@/lib/photo-storage";
export { HttpError, sameOrigin, respond, failure, limitedForm } from "@/lib/errors";
import { HttpError } from "@/lib/errors";

/**
 * The old Cloudflare D1 content database. The Node server has none: every route that still reads or writes
 * D1 answers 503 until its desk moves to the game backend (server hosting A3).
 */
export function database(): D1Database {
  throw new HttpError(
    503,
    "This desk is moving to the game backend and is unavailable for now.",
  );
}

/** Bunny private photo storage, from the `BUNNY_STORAGE_*` settings. */
export function bucket(): PhotoStorage {
  if (setting("PHOTO_STORAGE_PROVIDER") !== "bunny")
    throw new HttpError(503, "Photo storage is unavailable. Please try again.");
  try {
    return new BunnyPhotoStorage({
      zone: setting("BUNNY_STORAGE_ZONE") ?? "",
      endpoint: setting("BUNNY_STORAGE_ENDPOINT") ?? "",
      region: setting("BUNNY_STORAGE_REGION") ?? "",
      password: setting("BUNNY_STORAGE_PASSWORD") ?? "",
    });
  } catch {
    throw new HttpError(503, "Photo storage is unavailable. Please try again.");
  }
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
