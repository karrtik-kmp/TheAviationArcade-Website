import { firebaseSettings } from "@/lib/firebase-config";
import { verifyFirebaseToken } from "@/lib/firebase-verifier";
import { productCookieName, localAuthHost } from "@/lib/product-auth";
import { decodeJwt, decodeProtectedHeader } from "jose";
export const dynamic = "force-dynamic";
function reply(data: unknown, status = 200, cookie?: string) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    },
  });
}
function originMatches(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}
function cookie(value: string, host: string, maxAge: number) {
  return `${productCookieName(host)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${localAuthHost(host) ? "" : "; Secure"}`;
}
export async function POST(request: Request) {
  if (!originMatches(request))
    return reply({ error: "Sign in from this website." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return reply({ error: "A JSON sign-in request is required." }, 415);
  const host = new URL(request.url).host;
  try {
    const settings = firebaseSettings(host);
    if (!settings.configured || !settings.config)
      return reply(
        { error: "Email and Google sign-in are awaiting Firebase setup." },
        503,
      );
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "An ID token is required." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        return reply({ error: "The sign-in request is too large." }, 413);
      }
      chunks.push(result.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of chunks) {
      bytes.set(part, offset);
      offset += part.length;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (
      !body ||
      typeof body.idToken !== "string" ||
      Object.keys(body).some((key) => key !== "idToken")
    )
      return reply({ error: "An ID token is required." }, 400);
    try {
      decodeProtectedHeader(body.idToken);
      decodeJwt(body.idToken);
    } catch {
      return reply(
        { error: "Your sign-in could not be verified. Please sign in again." },
        401,
      );
    }
    const user = await verifyFirebaseToken(body.idToken, {
      projectId: settings.config.projectId,
      emulator: !!settings.emulatorUrl,
    });
    return reply(
      { signedIn: true },
      200,
      cookie(
        body.idToken,
        host,
        Math.max(
          0,
          Math.min(3600, user.expiresAt - Math.floor(Date.now() / 1000)),
        ),
      ),
    );
  } catch (error) {
    const unavailable =
      error instanceof TypeError ||
      (error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ERR_JWKS_TIMEOUT");
    return reply(
      {
        error: unavailable
          ? "The sign-in service is unavailable. Please retry."
          : "Your sign-in could not be verified. Please sign in again.",
      },
      unavailable ? 503 : 401,
    );
  }
}
export async function DELETE(request: Request) {
  if (!originMatches(request))
    return reply({ error: "Sign out from this website." }, 403);
  return reply(
    { signedOut: true },
    200,
    cookie("", new URL(request.url).host, 0),
  );
}
