/**
 * BackendClient: server-to-server calls from the Worker to the game backend, as the signed-in
 * member. It sends `Authorization: Bearer <the member's Firebase ID token>` and `X-Client: web`:
 * no cookie, no service secret, and the token is never logged. `X-Client: web` exempts the
 * website's server from the backend's app version gate (openapi 0.5.0, "Client version gate"); it
 * is a compatibility label, not a credential, and no `X-Client-Version` is sent. Relative imports only.
 */
import type { Bearer } from "./principal.ts";
import { mediaRightsStatementPattern } from "./media.ts";

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

/** No `GAME_API_BASE_URL` is configured. */
export class BackendNotConnected extends Error {
  constructor() {
    super("No game backend is configured.");
  }
}
/** The backend answered with an error, or could not be reached (`status` 0). */
export class BackendError extends Error {
  status: number;
  /** The backend's stable `error.code`, e.g. player_not_found; "" when absent. */
  code: string;
  /** Seconds, from `Retry-After`. */
  retryAfter?: number;
  constructor(status: number, code: string, retryAfter?: number) {
    super(`Game backend answered ${status}${code ? ` ${code}` : ""}.`);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/**
 * Per-call options. `idempotencyKey` is sent as `Idempotency-Key` and `rightsStatement` as
 * `X-Rights-Statement`, each only when given and valid (an invalid one throws before any request).
 */
export type SendOptions = { idempotencyKey?: string; rightsStatement?: "v1_own" | "v1_authorised"; timeoutMs?: number };
const idempotencyKeyPattern = /^[A-Za-z0-9_-]{1,128}$/;

export type BackendClient = {
  getJson(path: string): Promise<unknown>;
  send(method: string, path: string, body: unknown, contentType?: string, options?: SendOptions): Promise<unknown>;
  /** Like `send`, but also returns the backend's success status (e.g. 201 created, 200 replay). */
  sendWithStatus(
    method: string,
    path: string,
    body: unknown,
    contentType?: string,
    options?: SendOptions,
  ): Promise<{ status: number; body: unknown }>;
};

export function backendClient(
  options: { baseUrl?: string; fetch?: FetchFn; timeoutMs?: number },
  bearer: Bearer,
): BackendClient {
  const base = options.baseUrl?.trim().replace(/\/+$/, "");
  const call = options.fetch ?? ((input, init) => fetch(input, init));

  async function request(
    method: string,
    path: string,
    body?: unknown,
    contentType = "application/json",
    send: SendOptions = {},
  ): Promise<{ status: number; body: unknown }> {
    if (!base) throw new BackendNotConnected();
    if (send.idempotencyKey !== undefined && !idempotencyKeyPattern.test(send.idempotencyKey))
      throw new TypeError("The Idempotency-Key is not valid.");
    if (send.rightsStatement !== undefined && !mediaRightsStatementPattern.test(send.rightsStatement))
      throw new TypeError("The rights statement is not valid.");
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${bearer.reveal()}`,
      "X-Client": "web",
    };
    if (body !== undefined) headers["Content-Type"] = contentType;
    if (send.idempotencyKey !== undefined) headers["Idempotency-Key"] = send.idempotencyKey;
    if (send.rightsStatement !== undefined) headers["X-Rights-Statement"] = send.rightsStatement;
    let response: Response;
    try {
      response = await call(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : contentType === "application/json" ? JSON.stringify(body) : (body as BodyInit),
        // Never follow a redirect: it would carry the member's token elsewhere. "manual", not "error":
        // Cloudflare Workers reject redirect "error" outright (every call would throw before it is sent).
        redirect: "manual",
        signal: AbortSignal.timeout(send.timeoutMs ?? options.timeoutMs ?? 8000),
      });
    } catch {
      throw new BackendError(0, "unreachable");
    }
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      await response.body?.cancel().catch(() => {});
      throw new BackendError(0, "unreachable");
    }
    const parsed: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code =
        parsed && typeof parsed === "object" && "error" in parsed && parsed.error && typeof parsed.error === "object"
          ? String((parsed.error as { code?: unknown }).code ?? "")
          : "";
      const header = response.headers.get("Retry-After");
      const retry = header === null || header.trim() === "" ? NaN : Number(header);
      throw new BackendError(response.status, code, Number.isFinite(retry) && retry >= 0 ? retry : undefined);
    }
    return { status: response.status, body: parsed };
  }

  return {
    getJson: async (path) => (await request("GET", path)).body,
    send: async (method, path, body, contentType, send) => (await request(method, path, body, contentType, send)).body,
    sendWithStatus: (method, path, body, contentType, send) => request(method, path, body, contentType, send),
  };
}
