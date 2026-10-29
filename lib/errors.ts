/**
 * HTTP errors and JSON responses with no Worker or framework imports, so the router, the route
 * table and their tests can load them under plain `node --test`.
 */
export class HttpError extends Error {
  status: number;
  code?: string;
  /** Every reason a request was refused, for forms that list them (a release check). */
  errors?: string[];
  // Plain fields, not parameter properties: node --test strips types and cannot run those.
  constructor(status: number, message: string, code?: string, errors?: string[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
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
    return respond(
      {
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
        ...(error.errors?.length ? { errors: error.errors } : {}),
      },
      error.status,
    );
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
