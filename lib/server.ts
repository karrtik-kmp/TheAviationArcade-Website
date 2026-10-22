import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function database(): D1Database {
  if (!env.DB)
    throw new HttpError(
      503,
      "The content database is unavailable. Please try again.",
    );
  return env.DB;
}
export function bucket(): R2Bucket {
  if (!env.BUCKET)
    throw new HttpError(503, "Photo storage is unavailable. Please try again.");
  return env.BUCKET;
}
export async function identity() {
  const user = await getChatGPTUser();
  if (!user) throw new HttpError(401, "Sign in to continue.");
  return user;
}
export async function isStaff() {
  const user = await getChatGPTUser();
  const emails = (env.STAFF_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!user && emails.includes(user.email.toLowerCase());
}
export async function staff() {
  const user = await identity();
  if (!(await isStaff()))
    throw new HttpError(
      403,
      "This area is available to authorized editors only.",
    );
  return user;
}
export function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new HttpError(403, "This request must come from this website.");
}
export function respond(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function failure(error: unknown) {
  if (error instanceof HttpError)
    return respond({ error: error.message }, error.status);
  console.error(
    "Content request failed",
    error instanceof Error ? error.name : "unknown",
  );
  return respond(
    {
      error:
        "Something went wrong. Your work has not been published. Please retry.",
    },
    500,
  );
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
export async function limitedForm(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader)
    throw new HttpError(400, "Choose a photograph and add its details.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new HttpError(413, "Keep each photograph under 12 MB.");
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return await new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
      body: joined,
    }).formData();
  } catch {
    throw new HttpError(
      400,
      "The upload could not be read. Choose your photo and try again.",
    );
  }
}
